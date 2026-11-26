import random
import string

print("--- Strong Password Generator ---")

while True:
    try:
        user_input = input("Enter password length (e.g., 12):").strip()
        length = int(user_input)


        if length <= 0:
            print("Please enter a number greater than 0.")
            continue
        break
    except ValueError:
        print("Invalid input ! Please enter a Number only (letters are not allowed).")


all_characters = string.ascii_letters + string.digits + string.punctuation

generated_password = "".join(random.choices(all_characters, k=length))

print("-" * 40)
print(f"Your Secure Password is: {generated_password}")
print("-" * 40)




