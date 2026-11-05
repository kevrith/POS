import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Turns every error into a small JSON answer, and logs the full detail on the server.
 *
 * Prisma's own message embeds the failing query, so it is logged but never sent. The one database problem worth naming
 * to the client is a schema that is behind the code (P2021 table / P2022 column missing): the symptom is every screen
 * that reads that table failing at once, and "Internal server error" gave nobody a place to start. The message says the
 * database needs its pending migrations; the column name is added outside production only.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    let status = 500;
    let message = 'Internal server error';
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      // Bad or missing argument (e.g. an unparseable date from the query string).
      status = 400;
      message = 'Invalid or missing request parameter';
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2025') { status = 404; message = 'Record not found'; }
      else if (exception.code === 'P2002') { status = 409; message = 'A record with these details already exists'; }
      else if (exception.code === 'P2003') { status = 409; message = 'Referenced record does not exist or is still in use'; }
      else if (exception.code === 'P2021' || exception.code === 'P2022') {
        message = 'The database is out of date: a table or column this version needs is missing. Apply the pending database migrations.';
        const where = (exception.meta as { column?: string; table?: string } | undefined);
        const missing = where?.column ?? where?.table;
        if (missing && process.env.NODE_ENV !== 'production') message += ` (missing: ${missing})`;
      }
    } else if (exception instanceof Error && process.env.NODE_ENV !== 'production') {
      message = exception.message; // detail is for local debugging only
    }
    // The full Prisma message embeds the failing query, so log it but never send it.
    const logged = exception instanceof Error ? exception.message : message;
    if (status >= 500) this.logger.error(`[${status}] ${logged}`, exception instanceof Error ? exception.stack : '');
    else this.logger.warn(`[${status}] ${logged.split('\n').pop()}`);
    res.status(status).json({ statusCode: status, message });
  }
}
