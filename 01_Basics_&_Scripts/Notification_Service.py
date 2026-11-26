from abc import ABC, abstractmethod

class NotificationSender(ABC):

    @abstractmethod
    def send(self, recipient: str, message: str) -> bool:
        pass

class EmailNotification(NotificationSender):
    def __init__(self, sender_email: str):
        self.__sender = sender_email
        pass

    def send(self, recipient: str, message: str) -> bool:
        print(f"You have sent an email to {recipient}")
        return True

class SMSNotification(NotificationSender):
    def __init__(self, sender_number: str ):
        self.__sender = sender_number

    def send(self, recipient: str, message: str) -> bool:
        print(f"You have sent an SMS message to {recipient}")
        return True

class NotificationManager:
    def __init__(self):
        self.__history = []

    def send_to_all(self, services: list, recipient: str, message: str):
        for service in services:
            success = service.send(recipient, message)

            if success:
                log_entry = f"[{service.__class__.__name__}] Sent to {recipient} | Message: {message}"
                self.__history.append(log_entry)

    def show_history(self):
        print("\n---Log of sent notifications---")
        if not self.__history:
            print("The record is completely empty.")
        for log in self.__history:
            print(log)


if __name__ == "__main__":
    services_list = [
        EmailNotification("info@mycompany.com"),
        SMSNotification("+123456789")
    ]

    manger = NotificationManager()

    manger.send_to_all(services_list, "ahmed@example.com" , "Hello World!")

    print("-" * 40)

    manger.show_history()



