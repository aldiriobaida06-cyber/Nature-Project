class DeliveryVehicle:
    def __init__(self, driver_name, distance):
        self.driver_name = driver_name
        self.distance = distance

    def calculate_time(self):
        time = self.distance / 40
        return time

    def calculate_cost(self):
        cost = self.distance * 2
        return cost

    def display_info(self):
        print(f"The Driver: {self.driver_name}")
        print(f"Distance: {self.distance} KM")

class Bicycle(DeliveryVehicle):
    def __init__(self, driver_name, distance):
        super().__init__(driver_name, distance)

    def calculate_time(self):
        time = self.distance / 15
        return time

    def calculate_cost(self):
        return 5.0

class Car(DeliveryVehicle):
    def __init__(self, driver_name, distance, truk_capacity):
        super().__init__(driver_name, distance)
        self.truk_capacity = truk_capacity

    def calculate_time(self):
            time = self.distance / 60
            return time

    def calculate_cost(self):
            cost = self.distance * 5
            return cost

if __name__ == "__main__":
 print("---Car Test Drive---")

car1 = Car(driver_name="120 , Ahmed ", distance=100, truk_capacity=50)
car1.display_info()
print(f"Travel time by car: {car1.calculate_time()} hours")
print(f"Car delivery cost: {car1.calculate_cost()} Dollars")

print("\n--- The Pheasant Test Drive---")
bike1 = Bicycle( driver_name="15 , Ahmed ", distance=50 )
bike1.display_info()
print(f"Travel time by bike: {bike1.calculate_time()} hours")
print(f"bike delivery cost: {bike1.calculate_cost()} Dollars")









