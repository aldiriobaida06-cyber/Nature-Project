from operator import ifloordiv


class Book:
    def __init__(self, title, author, isbn):
        self.title = title
        self.author = author
        self.isbn = isbn
        self.is_available = True

    def display_info(self):
        status = "available" if self.is_available else "Borrowed"
        print(f"Book: {self.title} | author: {self.author} | condition: {status}")

class Member:
    def __init__(self, name, member_id):
        self.name = name
        self.member_id = member_id
        self.borrowed_books = []

    def borrow_book(self, book):
        if book.is_available:
            book.is_available = False
            self.borrowed_books.append(book)
            print(f"A book has been borrowed '{book.title}' Successfully by {self.name}.")
        else:
            print(f"Sorry,a book '{book.title}' has been already borrowed ")

    def return_book(self, book):
        if book in self.borrowed_books:
            book.is_available = True
            self.borrowed_books.remove(book)
            print(f"A book has been returned '{book.title}' Successfully by {self.name}.")
        else:
            print(f"This book is not listed in the loans record {self.name}.")

book1 = Book("12345" ,"Ahmed Ali" ,"Introduction to Python")
book2 = Book("Learn OOP", "67890" ,"Sarah Mohamed")

member1 = Member("Khaled", "M001")
library = [book1, book2]

print("\n---Books currently available in the library---")
for book in library:
    if book.is_available:
        book.display_info()


print("---Book condition before borrowing ---")
book1.display_info()

print("\n---Attempting to borrow")
member1.borrow_book(book1)

print("\n---Book condition after borrowing ---")
book1.display_info()

print("\n--- Attempting to borrow the same book again ---")
member1.borrow_book(book1)

print("\n---Return a book ---")
member1.return_book(book1)