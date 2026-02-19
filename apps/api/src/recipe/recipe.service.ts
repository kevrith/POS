import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryMovementType } from '@pos/shared';
import { v4 as uuidv4 } from 'uuid';

interface CreateRecipeDto {
  recipeItemId: string;
  ingredients: Array<{ itemId: string; quantityGrams: number }>;
}

@Injectable()
export class RecipeService {
  constructor(private prisma: PrismaService) {}

  async findAll(businessId: string) {
    return this.prisma.item.findMany({
      where: { businessId, type: 'RECIPE' },
      include: {
        recipeIngredients: {
          include: {
            ingredientItem: {
              select: { id: true, name: true, costPriceCents: true, weightUnit: true, unitWeightGrams: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async replaceIngredients(recipeItemId: string, businessId: string, ingredients: Array<{ itemId: string; quantityGrams: number }>) {
    const recipe = await this.prisma.item.findFirst({
      where: { id: recipeItemId, businessId, type: 'RECIPE' },
    });
    if (!recipe) throw new BadRequestException('Recipe item not found');

    await this.prisma.recipeIngredient.deleteMany({ where: { recipeItemId } });
    if (ingredients.length > 0) {
      await this.prisma.recipeIngredient.createMany({
        data: ingredients.map(i => ({
          recipeItemId,
          ingredientItemId: i.itemId,
          quantityGrams: i.quantityGrams,
        })),
      });
    }
    return { success: true };
  }

  async create(businessId: string, dto: CreateRecipeDto) {
    const recipe = await this.prisma.item.findFirst({
      where: { id: dto.recipeItemId, businessId, type: 'RECIPE' },
    });

    if (!recipe) throw new BadRequestException('Recipe item not found');

    await this.prisma.recipeIngredient.createMany({
      data: dto.ingredients.map(i => ({
        recipeItemId: dto.recipeItemId,
        ingredientItemId: i.itemId,
        quantityGrams: i.quantityGrams,
      })),
    });

    return { success: true };
  }

  async deductIngredients(recipeItemId: string, quantitySold: number, saleId: string, storeId: string, businessId: string) {
    const recipe = await this.prisma.item.findUnique({
      where: { id: recipeItemId },
      include: { recipeIngredients: true },
    });

    if (!recipe || recipe.type !== 'RECIPE') return;

    for (const ingredient of recipe.recipeIngredients) {
      await this.prisma.inventoryMovement.create({
        data: {
          offlineId: uuidv4(),
          businessId,
          itemId: ingredient.ingredientItemId,
          storeId,
          type: InventoryMovementType.RECIPE_DEDUCTION,
          quantity: -(ingredient.quantityGrams * quantitySold),
          saleId,
          recipeItemId,
          source: 'RECIPE',
        },
      });
    }
  }

  async calculateCost(recipeItemId: string) {
    const recipe = await this.prisma.item.findUnique({
      where: { id: recipeItemId },
      include: {
        recipeIngredients: {
          include: { ingredientItem: true },
        },
      },
    });

    if (!recipe) return 0;

    return recipe.recipeIngredients.reduce((total, ing) => {
      const costPerGram = (ing.ingredientItem.costPriceCents ?? 0) / (ing.ingredientItem.unitWeightGrams ?? 1000);
      return total + Math.round(costPerGram * ing.quantityGrams);
    }, 0);
  }
}
