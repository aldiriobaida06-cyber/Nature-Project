class App:
    def __init__(self, name, size_mb):
        self._name = name
        self._size_mb = size_mb
        self.is_running = False

    def open_app(self):
        self.is_running = True
        print(f"An application has been opened {self._name}")

    def close_app(self):
        self.is_running = False
        print(f"An application has  been closed {self._name}")
        pass

class MessagingApp(App):
    def __init__(self, name, size_mb, max_contacts):
        super().__init__(name, size_mb)
        self.max_contacts = max_contacts


    def send_message(self, to_person, message_text):
        if self.is_running:
            print(f" [{self._name}] Message sent to {to_person}: {message_text}")
        else:
            print(f"Warning: Cannot send message . {self._name} is closed!")

class GameApp(App):
    def __init__(self, name, size_mb, score):
        super().__init__(name, size_mb)
        self.score = score

    def play_game(self):
        if self.is_running:
            print(f"Playing {self._name} ... Current Score: {self.score}")
        else:
            print(f"Warning: Cannot play game . {self._name} is closed!")

whats_app = MessagingApp("WhatsApp", 45, max_contacts=150)
pubg_game = GameApp("PUBG", 2048, score=0)

print("---Messaging app experience---")
whats_app.send_message(to_person="Ahmed", message_text="Welcome")

whats_app.open_app()
whats_app.send_message(to_person="Ahmed", message_text="Welcome")
whats_app.close_app()

print("\n---Gaming app experience---")
pubg_game.play_game()

pubg_game.open_app()
pubg_game.play_game()
pubg_game.open_app()
pubg_game.close_app()
























