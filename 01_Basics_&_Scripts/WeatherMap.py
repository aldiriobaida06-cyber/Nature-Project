weather_database = {
    "berlin": {
        "temp_C": "18",
        "humidity": "65",
        "weatherDesc": " Party cloudy/Teils wolking"
    },
    "riyadh": {
        "temp_C": "38",
        "humdity": "10",
        "weatherDesc": " Sunny and hot/Sonnig"
    },
    "cairo": {
        "temp_C": "28",
        "humidity": "45",
        "weatherDesc": " Clear weather/Klar"
    },
    "berlin": {
        "temp_C": "18",
        "humidity": "65",
        "weatherDesc": "Cloudy/Bewölkt"
    }
}


city_name = input("Enter the city name (Berlin, Riyadh , Cairo):").strip().lower()


if city_name in weather_database:
    city_data = weather_database[city_name]

    temp_c = city_data["temp_C"]
    humidity = city_data["humidity"]
    weather_desc = city_data["weatherDesc"]


    print("\n" + "="*30)
    print(f"City: {city_name.capitalize()}")
    print(f"Temperature:{temp_c}C")
    print(f"Humidity:{humidity}%")
    print(f"Description:{weather_desc}")
    print("="*30)


else:
    print("\n Unregistered city name ! , Try typing : Berlin or Riyadh or Cairo")




















