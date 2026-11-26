import math

class Shape:
    def __init__(self, name):
        self.name = name

    def area(self):
        pass

    def perimeter(self):
        pass

class Rectangle(Shape):
    def __init__(self, width, height):
        super().__init__("Rectangle")
        self.width = width
        self.height = height

    def area(self):
        return self.width * self.height

    def perimeter(self):
        return 2 * (self.width * self.height)

class Circle(Shape):
    def __init__(self , radius):
        super().__init__("Circle")
        self.radius = radius

    def area(self):
        return math.pi * (self.radius ** 2)

    def perimeter(self):
        return 2 * math.pi * self.radius

shapes_list = [Rectangle(100, 200),Circle(7)]

for shape in shapes_list:
    print(f"---appearance: {shape.name}---")
    print(f"area: {shape.area():.2f}")
    print(f"perimeter: {shape.perimeter():.2f}")







