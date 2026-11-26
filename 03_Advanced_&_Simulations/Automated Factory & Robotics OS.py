from abc import ABC, abstractmethod

class FactoryMachine(ABC):
    def __init__(self, machine_id: str, power_consumption: int):
        self.machine_id = machine_id
        self.power_consumption = power_consumption
        self.__core_temperature = 25.0
        self.__is_running = False

    def get_temperature(self):
        return self.__core_temperature

    def update_temperature(self, amount):
        self.__core_temperature += amount
        if self.__core_temperature > 100:
            print(self.handle_emergency())


    def set_status(self, status: bool):
        self.__is_running = status

    def get_status(self):
        return self.__is_running

    @abstractmethod
    def handle_emergency(self) -> str:
        pass


class AssemblyRobot(FactoryMachine):
    def __init__(self, machine_id:str, arm_count:int):
        super().__init__(machine_id, power_consumption=50)
        self.arm_count = arm_count

    def perform_task(self) -> str:
        if not self.get_status():
            self.set_status(True)

        self.update_temperature(15.5)
        return f"Robot [{self.machine_id}] He is now assembling the pieces using {self.arm_count} arms.Temperature: {self.get_temperature()} degrees Celsius"

    def handle_emergency(self) -> str:
        self.set_status(False)
        return f"[Emergency] Robot [{self.machine_id}] Stop its arms immediately to avoid burnout!"

#==========================================================================================================
#==========================================================================================================
class FactoryDashboard:
    def __init__(self):
        self.machines = []

    def add_machine(self, machine: FactoryMachine):
        self.machines.append(machine)

    def start_all_operations(self):
        print("\n--- Full startup of the factory ---")
        for machine in self.machines:
            print(machine.perform_task())

    def emergency_shutdown_all(self):
        print("\n--- Emergency closure of all departments ---")
        for machine in self.machines:
            print(machine.handle_emergency())


if __name__ == "__main__":
    dashboard = FactoryDashboard()

    robot1 = AssemblyRobot(machine_id="Robot-A1", arm_count=4)
    robot2 = AssemblyRobot(machine_id="Robot-B2", arm_count=6)

    dashboard.add_machine(robot1)
    dashboard.add_machine(robot2)

    dashboard.start_all_operations()

    dashboard.emergency_shutdown_all()












