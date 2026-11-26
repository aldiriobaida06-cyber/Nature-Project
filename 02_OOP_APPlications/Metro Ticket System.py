class AdvancedMetroCard:
    def __init__(self, card_id, initial_balance, card_type="Regular"):
        self.__card_id = card_id
        self.__balance = initial_balance
        self.__station_cost = 0.5
        self.__card_type = card_type

    def get_balance(self):
        return self.__balance

    def tap_in(self, stations_count: int):
        if stations_count <= 0:
            print("Error:The number of stations must be greater than zero !")
            return

        base_cost = stations_count * self.__station_cost

        if self.__card_type == "Student":
            total_cost = base_cost * 0.50
            discount_text = "(Student Discount 50% Applied)"
        elif self.__card_type == "Senior":
            total_cost = base_cost * 0.30
            discount_text = "(Senior Discount 70% Applied)"
        else:
            total_cost = base_cost
            discount_text = ""
        if self.__balance >= total_cost:
            self.__balance -= total_cost
            print(f"Success! {discount_text}")
            print(f"Cost: {total_cost} | New balance: {self.__balance}")
        else:
            print(f"Failed! Insufficient balance. Cost needed: {total_cost} | Your balance: {self.__balance}")
#=========================================================================================================
#=========================================================================================================

student_card = AdvancedMetroCard(card_id="STU-11", initial_balance=10.0, card_type="Student")
print(f"--- Student Card Trip (8 Stations) ---")
student_card.tap_in(8)
print("-" * 40 + "\n")

senior_card = AdvancedMetroCard(card_id="SNR-22", initial_balance=10.0, card_type="Senior")
print(f"--- Senior Card Trip (8 Stations) ---")
senior_card.tap_in(8)
print("-" * 40 + "\n")

regular_card = AdvancedMetroCard(card_id="REG-33", initial_balance=10.0, card_type="Regular")
print(f"--- Regular Card Trip (8 Stations) ---")
regular_card.tap_in(8)
print("-" * 40 + "\n")








