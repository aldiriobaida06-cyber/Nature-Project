import os
tasks = []

if os.path.exists("../05_Data_&_Configs/tasks.text"):
    with open("../05_Data_&_Configs/tasks.text", "r", encoding="utf-8") as file :
        tasks = [line.strip()for line in file.readlines()]

while True:
    print("1-Important Addition")
    print("2-View Task")
    print("3-Delete Task")
    print("4-Exit")
    print("5-Search Task")

    choice= input("choose:")

    if choice == "1":
        task = input("Write your new task :")
        tasks.append(task)
        print("Task added")

        with open("../05_Data_&_Configs/tasks.text", "w", encoding="utf-8") as file :
            for t in tasks :
                file.write(t + "\n")

    elif choice == "2":
        if not tasks:
            print("NO tasks found !")
        else:
            for task in tasks :
                print(task)

    elif choice == "3":
        if not tasks:
            print("Your list is already empty !")
        else:
            task_to_delete = input("Write the task you want to delete:")
            if task_to_delete in tasks :
                tasks.remove(task_to_delete)
                print("Task deleted successfully")

                with open ("../05_Data_&_Configs/tasks.text", "w", encoding="utf-8") as file :
                    for t in tasks :
                        file.write(t + "\n")

            else:
                print("Task not found ! Check the spelling.")

    elif choice == "4":
        print("Goodbye !")
        break

    elif choice == "5":
        if not tasks:
            print("Your list is empty ! Nothing to search for.")
        else:
            keyword = input("Write the word you want to search for :")
            found_tasks = []

            for task in tasks :
                if keyword.lower() in task.lower():
                    found_tasks.append(task)

            if found_tasks:
                print("\n--- Search Results ---")
                for t in found_tasks :
                    print(f"- {t}")
            else:
                print("No tasks match your search !")