class StationSystem:
    def __init__(self, system_name: str):
        self.system_name = system_name

    def activate_emergency(self) -> str:
        pass

    def run_maintenance(self) -> str:
        pass

class OxygenSystem(StationSystem):
    def __init__(self, system_name:str):
        super().__init__(system_name)

    def activate_emergency(self) -> str:
        return f"Backup oxygen must be pumped in the Station"

    def run_maintenance(self) -> str:
        return f"The filters must be cleaned up in the Station"


class GravitySystem(StationSystem):
    def __init__(self, system_name:str):
        super().__init__(system_name)

    def activate_emergency(self) -> str:
        return f"The ground magnet must be installed!"

    def run_maintenance(self) -> str:
        return f"Calculating gravity field calibration"

class ShieldSystem(StationSystem):
    def __init__(self, system_name:str):
        super().__init__(system_name)

    def activate_emergency(self) -> str:
        return "Shield system must be emergency!"

    def run_maintenance(self) -> str:
        return "Shield being repaired!"

#====================================================================================
#====================================================================================
if __name__ == "__main__":
    space_station_systems = [OxygenSystem("Residential Sector A"), GravitySystem("Research Lab B"), ShieldSystem("Main Engine Room")]

    print("\n:Red Alert:Approaching meteor detected! Activating system protocols.")

    for system in space_station_systems:
        print(f"[{system.system_name}] emergency: {system.activate_emergency()}")
        print(f"[{system.system_name}] run_maintenance: {system.run_maintenance()}")
        print("-" * 50)
