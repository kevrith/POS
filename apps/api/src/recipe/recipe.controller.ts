import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { RecipeService } from './recipe.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';

@Controller('recipe')
@UseGuards(JwtAuthGuard, TenantGuard)
export class RecipeController {
  constructor(private recipeService: RecipeService) {}

  @Get()
  findAll(@Query('businessId') businessId: string) {
    return this.recipeService.findAll(businessId);
  }

  @Post()
  create(
    @Query('businessId') businessId: string,
    @Body() body: { recipeItemId: string; ingredients: Array<{ itemId: string; quantityGrams: number }> },
  ) {
    return this.recipeService.create(businessId, body);
  }

  @Put(':itemId/ingredients')
  replaceIngredients(
    @Param('itemId') itemId: string,
    @Query('businessId') businessId: string,
    @Body() body: { ingredients: Array<{ itemId: string; quantityGrams: number }> },
  ) {
    return this.recipeService.replaceIngredients(itemId, businessId, body.ingredients);
  }
}
