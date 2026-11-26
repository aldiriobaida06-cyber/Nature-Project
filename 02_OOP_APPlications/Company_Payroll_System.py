from abc import ABC, abstractmethod
# Abstraction:
class Employee(ABC):
    def __init__(self, name: str, employee_id: int):
        self.name = name
        # Encapsulation:
        self._employee_id = employee_id
    # Abstraction:
    @abstractmethod
    def calculate_salary(self) -> float:
        pass
# Inheritance:
class FullTimeEmployee(Employee):
    def __init__(self, name: str, employee_id: int, monthly_salary: float):
        super().__init__(name, employee_id)
        self.monthly_salary = monthly_salary
        # Polymorphism:
    def calculate_salary(self) -> float:
        return self.monthly_salary
# Inheritance:
class PartTimeEmployee(Employee):
    def __init__(self, name: str, employee_id: int, hours_worked: float, hourly_rate: float):
        super().__init__(name, employee_id)
        self.hours_worked = hours_worked
        self.hourly_rate = hourly_rate
    #Polymorphism:
    def calculate_salary(self) -> float:
         return self.hours_worked * self.hourly_rate

emp1 = FullTimeEmployee(name="Ahmed", employee_id=101, monthly_salary=5000.0)
emp2 = PartTimeEmployee(name="Sara", employee_id=102,hours_worked=40, hourly_rate=25.0)

company_employee = [emp1, emp2]

print("---Company Payroll Statement---")
# Polymorphism:
for emp in company_employee:
    salary = emp.calculate_salary()
    #Encapsulation:
    print(f"The Employee: {emp.name} | Employee ID: {emp._employee_id} | Salary: ${salary}")