class FootballPlayer:
    def __init__(self, name: str, position: str, rating: int, price: int):
        self.name = name
        self.position = position
        self.rating = rating
        self.price = price

    def __repr__(self):
        return f"{self.name:<12} ({self.position:<3}) | Rating: {self.rating} | Price: ${self.price}M"

scouted_players = [
    FootballPlayer("Silva", "MID", 88, 50),
    FootballPlayer("Santos", "DEF", 85, 30),
    FootballPlayer("Müller", "MID", 88 , 42),
    FootballPlayer("Costa", "FWD", 90, 85),
    FootballPlayer("Diaz", "DEF", 85, 35),
]

sorted_best_deals = sorted(scouted_players, key=lambda x: (x.rating, -x.price) , reverse=True)

print("---  Best Deals")
for deal in sorted_best_deals:
    print(deal)

budget = 100
purchased_players = []

for player in sorted_best_deals:
    if player.price <= budget:
        purchased_players.append(player)
        budget -= player.price
print("---Purchased Players---")
for player in purchased_players:
    print(player)

print(f"Remaining Budget: ${budget}M")


