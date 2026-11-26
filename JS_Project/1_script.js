const changeBtn = document.getElementById('change-btn');
const colorText = document.getElementById('color-text');

const hexChars = ['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F'];

changeBtn.addEventListener('click', function () {
    let hexColor = '#';

    for (let i = 0; i < 6; i++) {
        const randomIndex = Math.floor(Math.random() * hexChars.length);
        hexColor += hexChars[randomIndex];
    }
    colorText.textContent = hexColor;
    document.body.style.backgroundColor = hexColor;
});