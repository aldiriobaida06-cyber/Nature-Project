class BankAccount:
    def __init__(self, owner_name, initial_balance):
        self.owner = owner_name
        self.balance = initial_balance
        self.transaction_history = []

    def transfer(self, target_account, amount):
        if  self.balance >= amount:
            self.balance -= amount
            target_account.balance += amount
            print(f"it has been transferred {amount} Euro successfully {target_account.owner}.")
            self.transaction_history.append(f"Transfer to {target_account.owner}: -{amount} Euro")
            target_account.transaction_history.append(f"Transfer from {self.owner}: +{amount} Euro")
        else:
            print("Sorry,the balance is insufficient to complete the transfer")

    def deposit(self, amount):
        self.balance += amount
        print(f"it has been deposited {amount} Euro successfully.")
        self.transaction_history.append(f"Deposit: +{amount} Euro")

    def display_info(self):
        print(f"Account holder name: {self.owner} | Current balance: {self.balance} Euro.")


    def display_transaction_report(self):
        print(f"\n=== Transaction History Report for {self.owner} ===")
        for idx, transaction in enumerate(self.transaction_history, 1):
            print(f"{idx}. {transaction}")
            print("=========================================================")

class Object_BankAccount(BankAccount):
    def __init__(self, owner, initial_balance):
        super().__init__(owner, initial_balance)
        self.balance = initial_balance

    def get_owner_name(self):
        return self.owner

    def get_balance(self):
        return self.balance

    def display_info_rounded(self):
        rounded_balance = round(self.balance, 2)
        print(f"Account holder name: {self.owner} |  Rounded balance: {rounded_balance} Euro.")

if __name__ == "__main__":
    print("--- Testing the new sub-account ---")

my_account = Object_BankAccount("Obaida", 500.567)
my_account.display_info()
my_account.deposit(200)
my_account.display_info_rounded()

friend_account = BankAccount("Jamal", 100)

my_account.transfer(friend_account, 150)
my_account.display_info_rounded()
friend_account.display_info()

my_account.display_transaction_report()
friend_account.display_transaction_report()



