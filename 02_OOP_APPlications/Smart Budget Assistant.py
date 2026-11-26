import json
import os
from datetime import datetime

class Expense:
    def __init__(self, amount, category, description):
        self.amount = float(amount)
        self.category = category
        self.description = description
        self.date = datetime.now().strftime("%Y-%m-%d")

    def to_dict(self):
        return{
            "amount": self.amount,
            "description": self.description,
            "date": self.date
        }
class BudgetTracker:
    def __init__(self, username, salary):
        self.username = username
        self.salary = float(salary)
        self.filename = f"{username}_budget.json"
        self.expenses = self.load_data()

    def load_data(self):
        if os.path.exists(self.filename):
            with open(self.filename, "r") as file:
                return json.load(file)
        return []

    def save_data(self):
        with open(self.filename, "w") as file:
            json.dump(self.expenses, file, indent=4)

    def add_expense(self, amount, category, description):
        new_expense = Expense(amount, category, description)
        self.expenses.append(new_expense.to_dict())
        self.save_data()



    def get_report(self):
        total_spent = 0.0
        for exp in self.expenses:
            total_spent += exp["amount"]

        print(f"\n--- Financial Report ---")
        print(f"Total Spent: {total_spent}")
        print(f"Remaining : {self.salary - total_spent}")

        if total_spent > (self.salary * 0.70):
            print("WARNING: Expenses exceeded 70% of your salary!")


if __name__ == "__main__":
    print("--- Welcome to the smart budget assistant ---")
    name = input("Enter yor name:")
    income = input("Enter your monthly salary:")

    tracker = BudgetTracker(name, income)

    while True:
        print("\n1. Add an expenses")
        print("2. Get report and warning")
        print("3. Exit")
        choice = input("Select an option: (1-3)")

        if choice == "1":
            amt = input( " Enter amount:")
            cat = input("Caategory:(food,rent,entertainment...)")
            desc = input("Description:")
            tracker.add_expense(amt, cat, desc)
            print("Successfully added !")

        elif choice == "2":
            tracker.get_report()

        elif choice == "3":
            print("Thank you ! for using the program.Good luck")
            break
        else:
            print("Wrong choice,try again")





