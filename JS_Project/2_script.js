const num1Input=  document.getElementById('num1');
const num2Input= document.getElementById('num2');
const resultValue = document.getElementById('result-value');

const buttons = document.querySelectorAll('.op-btn');

 buttons.forEach(button => {
     button.addEventListener('click', function () {
         const num1 = parseFloat(num1Input.value);
         const num2 = parseFloat(num2Input.value);

         if (isNaN(num1) || isNaN(num2)) {
             alert('Please enter valid numbers in both fields!');
             return;
         }
         const operation = button.getAttribute('data-op');
         let result = 0;

         if (operation === '+') {
             result = num1 + num2;
         }else if (operation === '-') {
             result = num1 - num2;
         }else if (operation === '*')  {
             result = num1 * num2;
         }else if (operation === '/') {
             if (num2 === 0) {
                 alert("Cannot divide by zero!")
                 return;
             }
             result = num1 / num2;
         }
         resultValue.textContent = result;
     });
 });
