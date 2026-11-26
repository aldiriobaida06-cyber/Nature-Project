class Product:
    def __init__(self, title, bas_price, rating):
        self.title = title
        self.bas_price = bas_price
        self.rating = rating

    def get_final_price(self):
        pass

class DigitalGame(Product):
    def __init__(self, title, bas_price, rating):
        super().__init__(title, bas_price, rating )

    def get_final_price(self):
        return self.bas_price + (self.bas_price * 0.05)

class PhysicalHardware(Product):
    def __init__(self, title, bas_price, rating , weight):
        super().__init__(title, bas_price, rating)
        self.weight = weight

    def get_final_price(self):
        return self.bas_price + (self.weight * 2)

store_inventory = [
    DigitalGame("Pubg Mobile", 10, 4.7),
    DigitalGame("Fortnite", 14, 3.8),
    DigitalGame("Call of Duty", 21, 4.5),
    PhysicalHardware("PS5 Controller", 70, 4.8, 1.5)

]

prices_lowest_to_highest = sorted(store_inventory, key=lambda x: x.get_final_price())

print("Products are sorted from lowest to highest price:")
for item in prices_lowest_to_highest:
    print(f"item: {item.title} | final_price: {item.get_final_price() :.2f}")

print("-" * 40)

highest_rated = sorted(store_inventory, key=lambda x: x.rating, reverse=True)

print("Products are sorted by highest rating (most popular):")
for item in highest_rated:
    print(f"item: {item.title} | rating: {item.rating} /5")








