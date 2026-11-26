class Player:
    def __init__(self, username: str, score: int, level: int):
        self.username = username
        self.score = score
        self.level = level

    def __repr__(self):
        return f"{self.username:<10} | score: {self.score:<5} | level {self.level }"

players_list = [
    Player("Omari", 2500, 12),
    Player("Sami" , 1800, 8),
    Player("Obaida", 3200, 15),
    Player("Sara", 2500, 14),
    Player("Ahmed", 900, 3)
]

sorted_players_list = sorted(players_list, key=lambda x:(x.score, x.level) , reverse=True)

print("---\n Player Leaderboard---")
for player in sorted_players_list:
    print(player)



