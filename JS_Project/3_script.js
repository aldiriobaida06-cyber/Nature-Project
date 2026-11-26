const cityInput = document.getElementById('city-input');
const searchBtn = document.getElementById('search-btn');
const weatherBox = document.getElementById('weather-box');
const cityName = document.getElementById('city-name');
const temperature = document.getElementById('temperature');

searchBtn.addEventListener('click', async function (){
    const city = cityInput.value.trim();

    if (city === "") {
        alert("Please enter a city name first!");
        return;
    }
    try {
        let geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
        let geoData = await geoResponse.json();

        if (!geoData.results || geoData.results.length === 0) {
            alert("City not found, please check the spelling!");
            return;
        }

        const lat = geoData.results[0].latitude;
        const lon = geoData.results[0].longitude;
        const name = geoData.results[0].name;

        let weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m`);
        let weatherData = await weatherResponse.json();

        cityName.textContent = `Weather in ${name}`;
        temperature.textContent = weatherData.current.temperature_2m;

        weatherBox.classList.remove('hidden');
    } catch (error) {
        console.error("Error fetching data:",error);
        alert("Failed to connect to the weather server!")
    }
});

