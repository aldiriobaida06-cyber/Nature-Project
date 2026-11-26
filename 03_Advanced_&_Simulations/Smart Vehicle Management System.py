


class Vehicle:
    def __init__(self, brand, model):
        self.brand = brand
        self.model = model
        self._fuel_level = 100

    def show_info(self):
        print(f"Vehicle: {self.brand} {self.model} | Fuel: {self._fuel_level}%")


    def refuel(self):
        self._fuel_level = 100
        print(f"The vehicle {self._brand} has been refueled to 100%.")

    def start_engine(self):
        print("Starting generic vehicle engine...")


class Car(Vehicle):
    def __init__(self, brand, model, doors_count):
        super().__init__(brand, model)
        self.doors_count = doors_count

    def start_engine(self):
        print(f"Car sound: Vroom!")
        self._fuel_level -= 5

class Motorcycle(Vehicle):
    def __init__(self, brand, model,has_sidecar ):
        super().__init__(brand, model)
        self.has_sidecar = has_sidecar

    def start_engine(self):
        print(f"Bike sound: Ram Ram!")
        self._fuel_level -= 2


my_car = Car(brand="Toyota", model="Camry", doors_count=4)

my_bike = Motorcycle(brand="Yamaha", model="R1", has_sidecar= True)

print("---Car Testing---")
my_car.start_engine()
my_car.show_info()

print("---Motorcycle Testing---")
my_bike.start_engine()
my_bike.start_engine()
my_bike.start_engine()
my_bike.show_info()


