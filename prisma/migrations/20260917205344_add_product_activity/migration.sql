-- CreateTable
CREATE TABLE "ProductActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ProductActivity_shop_idx" ON "ProductActivity"("shop");

-- CreateIndex
CREATE INDEX "ProductActivity_productId_idx" ON "ProductActivity"("productId");
