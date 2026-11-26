class Passenger:
    def __init__(self, name, passport_num):
        self.name = name
        self.passport_num = passport_num

    def display_info(self):
        print(f"Name: {self.name}, Passport:  {self.passport_num}")

class Flight:
    def __init__(self, flight_number, destination, max_seats):
        self.flight_number = flight_number
        self.destination = destination
        self.max_seats = max_seats

        self.passengers = []
        self.waiting_list = []

    def search_passenger(self, passport_num):
        print(f"\n--- Searching for Passport: {passport_num}  ---")

        for p in self.passengers:
            if p.passport_num == passport_num:
                print(f"Found! {p.name} has a confirmed booking on flight{self.flight_number}.")
                return p
        for p in self.waiting_list:
            if p.passport_num == passport_num:
                print(f"Found! {p.name} is currently on the waiting list.")
                return p

        print("Passenger not found in this flight system.")
        return None

    def add_passenger(self, passenger):
        if len(self.passengers)  < self.max_seats:
            self.passengers.append(passenger)
            print(f"Success! {passenger.name} is booked on flight {self.flight_number}.")
        else:
            self.waiting_list.append(passenger)
            print(f"Flight is full. {passenger.name} added to the waiting list.")

    def display_flight_info(self):
        print(f"Flight Number: {self.flight_number} headed to {self.destination}")
        print(f"Current passengers: {len(self.passengers)}/{self.max_seats}")
        print(f"Waiting list: {len(self.waiting_list)}")

        print("---Passenger list for this flight---")
        for passenger in self.passengers:
            passenger.display_info()


    def display_waiting_list(self):
        print(f"\n Waiting list count: {len(self.waiting_list)}")
        for passenger in  self.waiting_list:
            passenger.display_info()

    def cancel_reservation(self, passenger ):
        if passenger in self.passengers:
            self.passengers.remove(passenger)
            print(f"The traveler's booking has been cancelled {passenger.name} and vacating his seat.")

            if len(self.waiting_list) > 0:
             next_passenger = self.waiting_list.pop(0)
             self.passengers.append(next_passenger)
             print(f"Automatically: The traveler has been upgraded {next_passenger.name} From the waiting list to the vacant seat!")

        elif passenger in self.waiting_list:
            self.waiting_list.remove(passenger)
            print(f"Remove traveler {passenger.name} From the waiting list, at his request")

        else:
            print(f"Excuse me,traveler {passenger.name} Not registered for this trip in the first place !")

my_flight = Flight("XY1123", "Dubai", 2)
print("---Starting the flight system---")

p1 = Passenger("Ahmad", "A12345")
p2 = Passenger("Sarah", "B67890")
p3 = Passenger("Ali", "C11223")

print("\n---Attempting to reserve seats---")
my_flight.add_passenger(p1)
my_flight.add_passenger(p2)
my_flight.add_passenger(p3)

print("\n--- View current flight status ---")
my_flight.display_flight_info()

print("\n--- Booking cancellation and automatic update ---")
my_flight.cancel_reservation(p1)

print("\n--- View final flight status ---")
my_flight.display_flight_info()

my_flight.search_passenger("B67890")
my_flight.search_passenger("000000")



