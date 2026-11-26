
class Hero:
    def __init__(self, name, health, attack_power):
        self.name = name
        self.health = health
        self.attack_power = attack_power

    def attack(selfs, other_hero):
        other_hero.health -= selfs.attack_power
        print(f"{selfs.name} attacked {other_hero.name} And caused him harm ! (-{selfs.attack_power} HP)")

    def is_alive(self):
        return self.health > 0

class Warrior(Hero):
    def __init__(self, name, health, attack_power, shield):
        super().__init__(name, health, attack_power)
        self.shield = shield

    def attack(self, other_hero):
        print(f"Warrior attacks ! {self.name} is advancing with a powerful attack !")
        super().attack(other_hero)

class Mage(Hero):
    def __init__(self, name, health, attack_power, mana):
        super().__init__(name, health, attack_power)
        self.mana = mana

    def attack(self, other_hero):
        if self.mana >= 10:
            actual_damage = self.attack_power * 2
            self.mana -= 10
            other_hero.health -= actual_damage
            print(f"{self.name} launched a Magic Spell on {other_hero.name} for {actual_damage} damage!")
        else:
            print(f"{self.name} is out of Mana! Attacks normally.")
            super().attack(other_hero)


if __name__ ==  "__main__":
    warriori1 = Warrior("Khaled Al the warrior", 120, 15, 30)
    mage1 =Mage("Obaida the Mage", 100, 20, 50)

    print("--- STARTING BATTLE --- \n")

    while warriori1.is_alive() and mage1.is_alive():

        warriori1.attack(mage1)
        print(f"{mage1.name} Health: {mage1.health}\n")

        if not mage1.is_alive():
            print(f"{mage1.name} has fallen !")
            break

        mage1.attack(warriori1)
        print(f"{warriori1.name} Health: {warriori1.health}\n")

        if not warriori1.is_alive():
            print(f"{warriori1.name} has fallen !")
            break

    print("--- GAME OVER ---")
    if warriori1.is_alive():
        print(f"Winner: {warriori1.name} !")
    else:
        print(f"Winner: {mage1.name}!")
