
class Product:
    def __init__(self, name: str, price: float, sales: int):
        self.name = name
        self.price = price
        self.sales = sales

    def __repr__(self):
        return f"{self.name} (${self.price}) - Sold: {self.sales}"

    def __lt__(self, other):
        return self.sales < other.sales

products_list = [
    Product("Laptop", 1200, 150),
    Product("Mouse", 25, 500),
    Product("Monitor", 350, 200)
]

products_list = [
    Product("PS5", 850, 320),
    Product("PC", 1500, 120),
    Product("MousePad", 10, 200)
]

keyword = input("Enter a word to search for and filter products: ")

filtered_list = []

for product in products_list:
    if keyword.lower() in product.name.lower():
        filtered_list.append(product)

sorted_products = sorted(filtered_list, key=lambda x: x.price, reverse=True)

print("\n---Extracted and filtered results---")
for product in sorted_products:
    print(product)








