class Employee:
    def __init__(self, name, emp_id, base_salary):
        self.name = name
        self.emp_id = emp_id
        self.base_salary = base_salary

class Developer(Employee):
    def __init__(self, name, emp_id, base_salary, programming_language):
        super().__init__(name, emp_id, base_salary)

        self.programming_language = programming_language

dev1 = Developer("Sara", 102, 8000, "Python")
print(dev1.name)
print(dev1.programming_language)

class Manager(Employee):
    def __init__(self, name, emp_id, base_salary, bonus):
        super().__init__(name, emp_id, base_salary)
        self.bonus = bonus

    def calculate_total_salary(self):
        return self.base_salary + self.bonus

mgr1 = Manager("Khaled", 103, 12000, 3000)
print(mgr1.name)
print(mgr1.calculate_total_salary())












