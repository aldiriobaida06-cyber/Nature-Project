class GiftCard:
    def __init__(self, code, balance):
        self.__code = code
        self.__balance = balance
        self.__is_used = False


    def get_code(self):
        return "****-****-" + self.__code[-4:]

    def get_balance(self):
        return self.__balance

    def redeem(self, price):
        if self.__is_used:
            print("This card has already been used!")
            return

        if price > self.__balance:
            print("Insufficient balance !")
            return

        self.__balance -= price
        print(f"Purchase successful ! : {self.__balance} Remaining balance")

        if self.__balance == 0:
            self.__is_used = True
            print("The balance has been fully used, and the card has been locked .")
#======================================================================================
#======================================================================================
my_card = GiftCard("PS5-REWARD", 100)

print("Card number: ", my_card.get_code())
my_card.redeem(40)

print("Current balance:", my_card.get_balance())





