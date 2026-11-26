

print('hi')
name = ('obaida')
print(name)
#this is a test
# int
age = 16

# float
abcd = 2.1

# string
name= 'obaida'


Name = 'obaida'
Age  = 16
ABCD = 2.1

print(name)
print(age)
print(abcd)
print(20 + 20 )
print(20 * 20 )
print(20 / 20 )
print(20 % 20 )
print(20 - 20 )



#modulus %
#number % same number
print(1000%1000)
 #small num % big num = small



num1= float (input("First Number :"))
num2= float (input("Second Number:"))



print("++++++++++++++++++++++")
print("Adding : "+ str( num1+num2))
print("subtract : "+ str( num1-num2))
print("multiply : "+ str( num1*num2))
print("divide : "+ str( num1/num2))
print("Modulus : "+ str( num1%num2))


# bloolean : True,False
# ==
#> <
# >= <=
# !

result = (20!=30)

print(result)

x=10
x= x + 90
print(x)

# Logical Operators
# and or
# and : true
# or
# not
x=5
y=15
print(5>15 or 3>44)
print(78>45 and 54>66)
print(not(28>33))

# if
name="jamal "
if name=="jamal":
    print("your name is jamal")
elif name=="obaida":
    print("your name is obaida")
else:
    print("your name is jamal")


# Calclator :
num1=float(input("Enter First Number :"))
oper=input("Choose an operation (+,-,/,*,%)  :")
num2=float(input("Enter Second  Number :"))

if oper == "+":
    result=num1+num2
    print(num1,"+",num2,"=",result)
elif oper=="-":
    result=num1-num2
    print(num1,"-",num2,"=",result)
elif oper=="*":
    result=num1*num2
    print(num1,"*",num2,"=",result)
elif oper=="/":
    result=num1/num2
    print(num1,"/",num2,"=",result)
elif oper=="%":
    result=num1%num2
    print(num1,"%",num2,"=",result)

# nested if
drink =input("What would you like to drink ? (coffee/tea) :")

if drink == "coffee":
    sugar=input("Do u want it black or with sugar?")

    if sugar=="black":
        print("Black Coffee")
    elif sugar =="with sugar":
        print("I like Coffee with sugar")
    elif drink=="tea":
        type_of_tea=input("Green tea or red Tea")
        if type_of_tea=="green":
            print("green tea")
        elif type_of_tea=="red":
            print("red tea")
        else:
            print("sorry we dont have it")


# if , and / or


#list
Students = ["Ahmed", "Obaida", "Jamal"]
print("Students are : Ahmed , Obaida , Jamal")

grades = [50, 66, 43, 21]
print("grades is : 50 ,66 , 43 ,21")


fruits =["apple", "banana", "cherry"]
print("before", fruits)
fruits[0] = "Kiwi"
print("after", fruits)

#list
# tools :
# append ()
# insert
# remove ()
# del
# pop :
print("after", fruits)
fruits =["apple", "banana", "cherry"]


print("before", fruits)
fruits.insert(0,"Kiwi")
print("after", fruits)
fruits =["apple", "banana", "cherry"]


print("before", fruits)
fruits.remove("banana")
print("after", fruits)
fruits =["apple", "banana", "cherry"]

print("before", fruits)
del fruits[0]
print("after", fruits)
fruits =["apple", "banana", "cherry"]

print("before", fruits)
fruits.pop(0)
print("after", fruits)
fruits =["apple", "banana", "cherry"]


# loops
#for in
for num in range(4):
    print("Obaida")

for num in range(11):
    print("my name is Obaida")

word = "Obaida"
for letter in word :
    print(letter)

total = 0
for i in range(1,11):
    total = total + i
print("total =", total)

#While
i=0
while i<5:
      print(i)
      i+=1

# for loops with list
names =["Obaida", "Jamal"]
for n in names :
    print(n)

grades = [5, 43, 21]
passed_students=0
for gra in grades :
    if gra >=50:
        passed_students+=1

print("number of students who passed",passed_students)

#break , continue

names =["Obaida", "Jamal","Basti","Ahmed"]

for name in names:
    if name =="Stop":
        print("Break the loop")
        break

print(name)


for i in range(1,5):
    if i==3:
        continue;
        print(i)

i =0
while i<5:
    i+=1
    if i==3:
        continue
    if i==4:
        break
        print("i",i)

#function :
def greet():
    print("Hello Bastian")


greet()

# Function : parameter
def say_hi(name,age):
 print("Hi",name)
 print("your age is",age)
say_hi("Bastian",14)


def add(x,y):
    print("Result",x+y)

add(3,4)
add(10,100)

#function : return

def display():
    return "Obaida"
name =display()
print(name)

def det_discount(price):
    return price*0.5

final_price = det_discount(10)
print(final_price)





import random

while True:
    answer = input("Do you want to play agin? :")

    if answer.lower() != "yes":
        break
    secret_number = random.randint(1,100)

    print("Gussing number Game ")
    print("100,1 Gussing The number")

    while True :
        guess = int(input("Write a number :"))

        if guess < secret_number:
            print("You nned to raise the number")

        elif guess > secret_number:
            print("You need to lower the number")

        else:
            print("Congratulations! You guessed the Numaber")
            break





