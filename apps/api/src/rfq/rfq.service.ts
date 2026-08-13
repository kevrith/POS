import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

/** A quote row that has no price yet — the supplier has been invited but not replied. */
const INVITED = 'INVITED';

@Injectable()
export class RFQService {
  private readonly logger = new Logger(RFQService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  private async nextRfqNumber(businessId: string): Promise<string> {
    const count = await this.prisma.rFQ.count({ where: { businessId } });
    return `RFQ-${String(count + 1).padStart(5, '0')}`;
  }

  private static webBase(): string {
    return (process.env.FRONTEND_URL ?? 'http://localhost:3001').replace(/\/$/, '');
  }

  private static quoteUrl(token: string): string {
    return `${RFQService.webBase()}/quote/${token}`;
  }

  /**
   * Kenyan numbers get typed as 07…, +254…, or 254… — wa.me accepts digits only, with
   * the country code and no leading zero. Returns null when there is nothing dialable.
   */
  static normalisePhone(raw?: string | null): string | null {
    if (!raw) return null;
    const digits = raw.replace(/[^0-9]/g, '');
    if (digits.length < 9) return null;
    if (digits.startsWith('254')) return digits;
    if (digits.startsWith('0')) return `254${digits.slice(1)}`;
    if (digits.length === 9) return `254${digits}`;
    return digits; // already international, some other country
  }

  /** Every mutating call goes through this so an RFQ from another tenant is never touched. */
  private async requireRfq(rfqId: string, businessId: string) {
    const rfq = await this.prisma.rFQ.findFirst({ where: { id: rfqId, businessId } });
    if (!rfq) throw new NotFoundException('RFQ not found');
    return rfq;
  }

  async list(businessId: string, status?: string) {
    const rfqs = await this.prisma.rFQ.findMany({
      where: { businessId, ...(status ? { status } : {}) },
      include: { items: true, responses: { include: { supplier: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // RFQItem stores only itemId — resolve names so the UI isn't showing UUIDs.
    const itemIds = [...new Set(rfqs.flatMap((r) => r.items.map((i) => i.itemId)))];
    const items = itemIds.length
      ? await this.prisma.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true, barcode: true },
        })
      : [];
    const byId = new Map(items.map((i) => [i.id, i]));

    return rfqs.map((r) => ({
      ...r,
      items: r.items.map((i) => ({
        ...i,
        itemName: byId.get(i.itemId)?.name ?? 'Unknown item',
        itemSku: byId.get(i.itemId)?.barcode ?? null,
      })),
    }));
  }

  async create(dto: {
    businessId: string;
    storeId?: string;
    createdBy: string;
    notes?: string;
    deadline?: string;
    items: Array<{ itemId: string; quantityNeeded: number }>;
    supplierIds?: string[];
  }) {
    const lines = (dto.items ?? []).filter((i) => i.itemId && i.quantityNeeded > 0);
    if (lines.length === 0) {
      throw new BadRequestException('Add at least one item with a quantity');
    }

    // storeId is required by the schema but the RFQ screen has no store picker —
    // fall back to the business's first store rather than failing the request.
    const storeId =
      dto.storeId ??
      (
        await this.prisma.store.findFirst({
          where: { businessId: dto.businessId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        })
      )?.id;
    if (!storeId) {
      throw new BadRequestException('Create a store before raising an RFQ');
    }

    const known = await this.prisma.item.count({
      where: { businessId: dto.businessId, id: { in: lines.map((l) => l.itemId) } },
    });
    if (known !== new Set(lines.map((l) => l.itemId)).size) {
      throw new BadRequestException('One or more items do not belong to this business');
    }

    const rfqNumber = await this.nextRfqNumber(dto.businessId);
    const rfq = await this.prisma.rFQ.create({
      data: {
        rfqNumber,
        businessId: dto.businessId,
        storeId,
        createdBy: dto.createdBy,
        notes: dto.notes,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        items: {
          create: lines.map((l) => ({
            itemId: l.itemId,
            quantityNeeded: Math.round(l.quantityNeeded),
          })),
        },
      },
      include: { items: true },
    });

    if (dto.supplierIds?.length) {
      await this.invite(rfq.id, dto.businessId, dto.supplierIds);
    }

    return rfq;
  }

  /**
   * Invite suppliers to quote. Each invitation is a priceless RFQResponse row carrying an
   * opaque token — the supplier follows that link and enters their own price, so the buyer
   * never retypes a WhatsApp reply. Re-inviting an existing supplier is a no-op.
   */
  async invite(rfqId: string, businessId: string, supplierIds: string[]) {
    await this.requireRfq(rfqId, businessId);

    const ids = [...new Set((supplierIds ?? []).filter(Boolean))];
    if (ids.length === 0) throw new BadRequestException('Select at least one supplier');

    const suppliers = await this.prisma.supplier.findMany({
      where: { id: { in: ids }, businessId },
      select: { id: true },
    });
    if (suppliers.length !== ids.length) {
      throw new BadRequestException('One or more suppliers do not belong to this business');
    }

    const existing = await this.prisma.rFQResponse.findMany({
      where: { rfqId, supplierId: { in: ids } },
      select: { supplierId: true },
    });
    const already = new Set(existing.map((e) => e.supplierId));
    const fresh = ids.filter((id) => !already.has(id));

    if (fresh.length > 0) {
      await this.prisma.rFQResponse.createMany({
        data: fresh.map((supplierId) => ({
          rfqId,
          supplierId,
          quotedPriceCents: 0,
          status: INVITED,
          token: randomBytes(24).toString('hex'),
        })),
      });
    }

    return this.getRecipients(rfqId, businessId);
  }

  async removeInvite(rfqId: string, responseId: string, businessId: string) {
    await this.requireRfq(rfqId, businessId);
    const response = await this.prisma.rFQResponse.findFirst({
      where: { id: responseId, rfqId },
    });
    if (!response) throw new NotFoundException('Invitation not found on this RFQ');
    if (response.status !== INVITED) {
      throw new BadRequestException('This supplier has already quoted — award or ignore it instead');
    }
    await this.prisma.rFQResponse.delete({ where: { id: responseId } });
    return { removed: true };
  }

  /**
   * Everything the UI needs to hand an RFQ to a supplier: the ready-to-send message, a
   * wa.me deep link (opens WhatsApp with the text filled in, sent from the user's own
   * number — no Meta approval needed) and the quote link itself for copy/paste.
   */
  async getRecipients(rfqId: string, businessId: string) {
    const rfq = await this.prisma.rFQ.findFirst({
      where: { id: rfqId, businessId },
      include: {
        items: true,
        responses: { include: { supplier: true } },
      },
    });
    if (!rfq) throw new NotFoundException('RFQ not found');

    const [business, itemNames] = await Promise.all([
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: { name: true },
      }),
      this.itemNameMap(rfq.items.map((i) => i.itemId)),
    ]);

    return rfq.responses.map((r) => {
      const message = RFQService.buildMessage({
        businessName: business?.name ?? 'Our business',
        rfqNumber: rfq.rfqNumber,
        deadline: rfq.deadline,
        notes: rfq.notes,
        lines: rfq.items.map(
          (i) => `${itemNames.get(i.itemId) ?? 'Item'} x ${i.quantityNeeded}`,
        ),
        quoteUrl: r.token ? RFQService.quoteUrl(r.token) : null,
      });
      const phone = RFQService.normalisePhone(r.supplier.phone ?? r.supplier.contact);

      return {
        responseId: r.id,
        supplierId: r.supplierId,
        supplierName: r.supplier.name,
        phone,
        email: r.supplier.email,
        status: r.status,
        invitedAt: r.invitedAt,
        respondedAt: r.respondedAt,
        quoteUrl: r.token ? RFQService.quoteUrl(r.token) : null,
        message,
        whatsappUrl: phone
          ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
          : null,
      };
    });
  }

  private async itemNameMap(itemIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(itemIds)];
    if (ids.length === 0) return new Map();
    const items = await this.prisma.item.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(items.map((i) => [i.id, i.name]));
  }

  /** Plain text on purpose — it has to read well in WhatsApp, SMS and email alike. */
  private static buildMessage(opts: {
    businessName: string;
    rfqNumber: string;
    deadline: Date | null;
    notes: string | null;
    lines: string[];
    quoteUrl: string | null;
  }): string {
    const parts = [
      `*Request for Quotation ${opts.rfqNumber}*`,
      `From: ${opts.businessName}`,
      '',
      'Please quote for:',
      ...opts.lines.map((l) => `• ${l}`),
    ];
    if (opts.notes) parts.push('', opts.notes);
    if (opts.deadline) {
      parts.push('', `Reply by: ${opts.deadline.toLocaleDateString('en-KE')}`);
    }
    if (opts.quoteUrl) {
      parts.push('', 'Submit your price here:', opts.quoteUrl);
    }
    return parts.join('\n');
  }

  /**
   * Mark the RFQ as issued and email every invited supplier who has an email address.
   * WhatsApp goes out from the browser via the wa.me links in `recipients` — sending it
   * server-side would need a Meta Business API approval this build deliberately avoids.
   */
  async send(id: string, businessId: string) {
    const rfq = await this.requireRfq(id, businessId);
    if (rfq.status === 'AWARDED') {
      throw new BadRequestException('This RFQ has already been awarded');
    }

    const updated = await this.prisma.rFQ.update({
      where: { id },
      data: { status: 'SENT' },
    });
    await this.prisma.rFQResponse.updateMany({
      where: { rfqId: id, status: INVITED, invitedAt: null },
      data: { invitedAt: new Date() },
    });

    const recipients = await this.getRecipients(id, businessId);
    const emailed: string[] = [];
    for (const r of recipients) {
      if (r.status !== INVITED || !r.email) continue;
      try {
        const ok = await this.email.send({
          to: r.email,
          subject: `Request for Quotation ${rfq.rfqNumber}`,
          html: RFQService.messageToHtml(r.message, r.quoteUrl),
        });
        if (ok) emailed.push(r.supplierName);
      } catch (err) {
        // A dead mailbox must not block the rest of the send.
        this.logger.warn(`RFQ ${rfq.rfqNumber}: email to ${r.supplierName} failed: ${String(err)}`);
      }
    }

    return { ...updated, recipients, emailed };
  }

  private static messageToHtml(message: string, quoteUrl: string | null): string {
    // The raw URL is for WhatsApp/SMS; in email it becomes a button, so drop the bare line.
    const body = (quoteUrl ? message.replace(`\n${quoteUrl}`, '') : message)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/\*(.+?)\*/g, '<strong>$1</strong>')
      .split('\n')
      .join('<br>');
    const button = quoteUrl
      ? `<p style="margin-top:24px"><a href="${quoteUrl}" style="background:#7c3aed;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Submit your quote</a></p>`
      : '';
    return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#111">${body}${button}</div>`;
  }

  async addResponse(
    rfqId: string,
    businessId: string,
    dto: {
      supplierId: string;
      quotedPriceCents: number;
      deliveryDays?: number;
      validUntil?: string;
      notes?: string;
    },
  ) {
    const rfq = await this.requireRfq(rfqId, businessId);
    if (rfq.status === 'AWARDED') {
      throw new BadRequestException('This RFQ has already been awarded');
    }
    if (!Number.isFinite(dto.quotedPriceCents) || dto.quotedPriceCents <= 0) {
      throw new BadRequestException('Enter a quoted price greater than zero');
    }

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, businessId },
      select: { id: true },
    });
    if (!supplier) throw new BadRequestException('Supplier not found in this business');

    const existing = await this.prisma.rFQResponse.findFirst({
      where: { rfqId, supplierId: dto.supplierId },
    });

    const data = {
      quotedPriceCents: Math.round(dto.quotedPriceCents),
      deliveryDays: dto.deliveryDays,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
      notes: dto.notes,
      respondedAt: new Date(),
    };

    // A supplier re-quoting should replace their bid, not create a second row. An invited
    // supplier who phones their price in has to leave INVITED, or it reads as no reply.
    if (existing) {
      return this.prisma.rFQResponse.update({
        where: { id: existing.id },
        data: existing.status === INVITED ? { ...data, status: 'PENDING' } : data,
      });
    }

    return this.prisma.rFQResponse.create({
      data: { rfqId, supplierId: dto.supplierId, ...data },
    });
  }

  async awardResponse(rfqId: string, responseId: string, businessId: string) {
    await this.requireRfq(rfqId, businessId);
    const response = await this.prisma.rFQResponse.findFirst({
      where: { id: responseId, rfqId },
    });
    if (!response) throw new NotFoundException('Quote not found on this RFQ');
    if (response.status === INVITED) {
      throw new BadRequestException('This supplier has not quoted yet');
    }

    return this.prisma.$transaction(async (tx) => {
      // Suppliers who never replied stay INVITED — calling them "rejected" would erase
      // the fact that they simply never came back.
      await tx.rFQResponse.updateMany({
        where: { rfqId, status: { not: INVITED } },
        data: { status: 'REJECTED' },
      });
      await tx.rFQResponse.update({ where: { id: responseId }, data: { status: 'AWARDED' } });
      return tx.rFQ.update({ where: { id: rfqId }, data: { status: 'AWARDED' } });
    });
  }

  async getComparison(rfqId: string, businessId: string) {
    await this.requireRfq(rfqId, businessId);
    return this.prisma.rFQ.findUnique({
      where: { id: rfqId },
      include: { items: true, responses: { include: { supplier: true } } },
    });
  }

  // ─── Public supplier quote link (no auth — the token IS the credential) ──────

  private async requireToken(token: string) {
    const response = await this.prisma.rFQResponse.findUnique({
      where: { token },
      include: { rfq: { include: { items: true } }, supplier: true },
    });
    if (!response) throw new NotFoundException('This quote link is not valid');
    return response;
  }

  /** What the supplier sees on /quote/:token — never leaks other suppliers' prices. */
  async getPublicQuote(token: string) {
    const response = await this.requireToken(token);
    const [business, itemNames] = await Promise.all([
      this.prisma.business.findUnique({
        where: { id: response.rfq.businessId },
        select: { name: true },
      }),
      this.itemNameMap(response.rfq.items.map((i) => i.itemId)),
    ]);

    const closed = response.rfq.status === 'AWARDED' || response.rfq.status === 'CANCELLED';

    return {
      rfqNumber: response.rfq.rfqNumber,
      businessName: business?.name ?? 'Buyer',
      notes: response.rfq.notes,
      deadline: response.rfq.deadline,
      closed,
      supplierName: response.supplier.name,
      items: response.rfq.items.map((i) => ({
        id: i.id,
        name: itemNames.get(i.itemId) ?? 'Item',
        quantityNeeded: i.quantityNeeded,
      })),
      submitted: response.status !== INVITED,
      quote:
        response.status === INVITED
          ? null
          : {
              quotedPriceCents: response.quotedPriceCents,
              deliveryDays: response.deliveryDays,
              validUntil: response.validUntil,
              notes: response.notes,
              respondedAt: response.respondedAt,
            },
    };
  }

  /** The supplier submits their own price. Re-submitting overwrites their previous one. */
  async submitPublicQuote(
    token: string,
    dto: {
      quotedPriceCents: number;
      deliveryDays?: number;
      validUntil?: string;
      notes?: string;
    },
  ) {
    const response = await this.requireToken(token);
    if (response.rfq.status === 'AWARDED' || response.rfq.status === 'CANCELLED') {
      throw new BadRequestException('This RFQ is closed and is no longer accepting quotes');
    }
    if (response.status === 'AWARDED' || response.status === 'REJECTED') {
      throw new BadRequestException('This quote has already been decided');
    }

    const price = Math.round(Number(dto.quotedPriceCents));
    if (!Number.isFinite(price) || price <= 0) {
      throw new BadRequestException('Enter a price greater than zero');
    }
    const days =
      dto.deliveryDays == null || dto.deliveryDays === ('' as unknown as number)
        ? null
        : Math.round(Number(dto.deliveryDays));
    if (days != null && (!Number.isFinite(days) || days < 0)) {
      throw new BadRequestException('Delivery days must be zero or more');
    }

    await this.prisma.rFQResponse.update({
      where: { id: response.id },
      data: {
        quotedPriceCents: price,
        deliveryDays: days,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        notes: dto.notes?.trim() || null,
        status: 'PENDING',
        respondedAt: new Date(),
      },
    });

    // Surface on the buyer's board that quotes are coming in.
    if (response.rfq.status === 'DRAFT' || response.rfq.status === 'SENT') {
      await this.prisma.rFQ.update({
        where: { id: response.rfqId },
        data: { status: 'RECEIVED' },
      });
    }

    return { submitted: true, rfqNumber: response.rfq.rfqNumber };
  }
}
