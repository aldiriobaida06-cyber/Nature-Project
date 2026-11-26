from abc import ABC, abstractmethod

class Shape(ABC):
    @abstractmethod
    def get_area(self) -> float:
        pass

class Square(Shape):
    def __init__(self, side_length: float| int):
        self.side_length = side_length

    def get_area(self) -> float:
        return self.side_length * self.side_length

class Rectangle(Shape):
    def __init__(self, side_width: float, side_length: float ):
        self.side_width = side_width
        self.side_length = side_length

    def get_area(self) -> float:
        return self.side_width * self.side_length

my_square = Square(side_length=5)
my_rectangle = Rectangle(side_width=4, side_length=6)

def print_shape_area(any_shape: Shape):
    print(f"The area equals: {any_shape.get_area()}")

print_shape_area(my_square)
print_shape_area(my_rectangle)





























