-- CreateTable
CREATE TABLE "FoodIngredient" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT,
    "defaultWastePct" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FoodIngredientCost" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ingredientId" INTEGER NOT NULL,
    "unitCost" DECIMAL NOT NULL,
    "effectiveDate" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoodIngredientCost_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "FoodIngredient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FoodRecipe" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "mealType" TEXT NOT NULL DEFAULT 'DESAYUNO',
    "yield" DECIMAL NOT NULL DEFAULT 1,
    "yieldUnit" TEXT DEFAULT 'raciones',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FoodRecipeItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "recipeId" INTEGER NOT NULL,
    "ingredientId" INTEGER,
    "childRecipeId" INTEGER,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "unit" TEXT,
    "wastePct" DECIMAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoodRecipeItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "FoodRecipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FoodRecipeItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "FoodIngredient" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FoodRecipeItem_childRecipeId_fkey" FOREIGN KEY ("childRecipeId") REFERENCES "FoodRecipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FoodRecipeCost" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "recipeId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "costType" TEXT NOT NULL DEFAULT 'OTROS',
    "period" TEXT NOT NULL DEFAULT 'POR_RACION',
    "periodRations" DECIMAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoodRecipeCost_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "FoodRecipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FoodCostPool" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'OTROS',
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL DEFAULT 'MENSUAL',
    "periodRations" DECIMAL,
    "appliesTo" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "FoodIngredient_name_key" ON "FoodIngredient"("name");

-- CreateIndex
CREATE INDEX "FoodIngredientCost_ingredientId_effectiveDate_idx" ON "FoodIngredientCost"("ingredientId", "effectiveDate");

-- CreateIndex
CREATE INDEX "FoodRecipe_mealType_isActive_idx" ON "FoodRecipe"("mealType", "isActive");

-- CreateIndex
CREATE INDEX "FoodRecipeItem_recipeId_idx" ON "FoodRecipeItem"("recipeId");

-- CreateIndex
CREATE INDEX "FoodRecipeItem_ingredientId_idx" ON "FoodRecipeItem"("ingredientId");

-- CreateIndex
CREATE INDEX "FoodRecipeItem_childRecipeId_idx" ON "FoodRecipeItem"("childRecipeId");

-- CreateIndex
CREATE INDEX "FoodRecipeCost_recipeId_idx" ON "FoodRecipeCost"("recipeId");

-- CreateIndex
CREATE INDEX "FoodCostPool_appliesTo_idx" ON "FoodCostPool"("appliesTo");
