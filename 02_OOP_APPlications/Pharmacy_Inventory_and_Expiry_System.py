class Medicine:
    def __init__(self, med_id: int, name: str, price: float, quantity: int):
        self.med_id = med_id
        self.name = name
        self.price = price
        self.quantity = quantity

    def __repr__(self):
        return f"[{self.med_id}] {self.name} -Quantity: {self.quantity} -Price: {self.price}"

class PharmacyInventory:
    def __init__(self):
        self.medicines_list = [
            Medicine("Ibu_123", "Ibuprofen", 10,20),
            Medicine("Asp_456", "Aspirin",12, 10),
            Medicine("Amo_789", "Amoxicillin",20, 10)
        ]

    def add_medicine(self, medicine: Medicine):
        self.medicines_list.append(medicine)
        print(f"A medicine has been added!")

    def sell_medicine(self, name_to_sell: str, amount: int):
        if len(self.medicines_list) == 0:
            print("No medicines available")
            return

        medicine_found = False

        for medicine in self.medicines_list:
            if medicine.name.lower() == name_to_sell.lower():
                medicine_found = True

                if medicine.quantity > amount:
                    medicine.quantity -= amount
                    total_price = medicine.price * amount
                    print(f"Successfully sold {amount} of {medicine.name}. Total price: ${total_price}")
                else:
                    print(f"Not enough quantity! only {medicine.quantity} available.")

                break

        if not medicine_found:
            print(f"Medicine '{name_to_sell}' not found in the pharmacy .")

my_pharmacy = PharmacyInventory()

my_pharmacy.sell_medicine("Ibuprofen", 5)


new_med = Medicine("Pan_999", "Panadol", 8,30)
my_pharmacy.add_medicine(new_med)







