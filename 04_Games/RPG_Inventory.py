class item:
    def __init__(self, name: str, item_type: str, power: int, value_gold: int):
        self.name = name
        self.item_type = item_type
        self.power = power
        self.value_gold = value_gold

    def __repr__(self):
        return f" [{self.item_type:<7}] {self.name:<15} | Power: {self.power:<3} | Gold: {self.value_gold}"

class RPGInventory:
    def __init__(self, max_slots: int):
        self.value = []
        self.max_slots = max_slots

    def add_to_inventory(self, item: item):
        """""Adding an item to the vault after the check"""
        if len(self.value) < self.max_slots:
            self.value.append(item)
            print(f"Added {item.name} successfully to the inventory.")
        else:
            print(f"Addition failed! The inventory is full.Cannot add [{item.name}].")

    def get_inventory_report(self):
        if not self.value:
            print("The inventory is  completely empty.")
            return

        print("\n===Player Inventory Report===")
        for idx, item in enumerate(self.value, 1):
            print(f"{idx}. {item}")
            print("=========================")

player_value = RPGInventory(max_slots=3)

item1 = item("Excalibur Sword", "Weapon", 95, 500)
item2 = item("Dragon Shield", "Armor", 80, 350)
item3 = item("Health Potion", "Potion", 50, 50)
item4 = item("Shadow Dagger", "Weapon", 65, 200)

player_value.add_to_inventory(item1)
player_value.add_to_inventory(item2)
player_value.add_to_inventory(item3)
player_value.add_to_inventory(item4)

player_value.get_inventory_report()

