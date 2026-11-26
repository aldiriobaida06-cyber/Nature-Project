const CRYPTO_API = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd';
const FIAT_API = 'https://open.er-api.com/v6/latest/USD';
let cachedRates = null;

const btcEl = document.getElementById('btc-price');
const ethEl = document.getElementById('eth-price');
const fromSelect = document.getElementById('from-currency');
const toSelect  = document.getElementById('to-currency');
const amountInput = document.getElementById('amount-input');
const convertBtn =  document.getElementById('convert-btn');
const resultBox = document.getElementById('conversion-result');
const dashboardContainer = document.getElementById('dashboard');
const statusText = document.getElementById('update-status');

async function fetchAllData(){
    if (dashboardContainer) dashboardContainer.classList.add('loading');
    if (statusText) statusText.innerText = 'Fetching latest market rates...';
     try {
         const [cryptoResponse, fiatResponse] = await Promise.all([
             window.fetch(CRYPTO_API),
             window.fetch(FIAT_API)
         ]);
         if (!cryptoResponse.ok || !fiatResponse.ok) {
             if (typeof logErrorUI === 'function')logErrorUI();
             return;
         }
         const cryptoData = await cryptoResponse.json();
         const fiatData = await fiatResponse.json();
         cachedRates = fiatData.rates;
         updateCryptoUI(cryptoData);

         if (fromSelect && fromSelect.children.length === 0) {
             populateCurrencyOptions(Object.keys(cachedRates));
         }

         if (statusText) {
             statusText.style.color = 'var(--success-color, green';
             statusText.innerHTML = `Last updated: ${new Date().toLocaleTimeString()}`;
         }
     } catch (error) {
         console.error('Network  Error:', error);
         if (statusText)  {
             statusText.style.color = 'var(--error-color, red)';
             statusText.innerHTML = 'Sync failed. Retrying shortly...';
         }
     } finally {
         if (dashboardContainer) dashboardContainer.classList.remove('loading');
     }
}
function updateCryptoUI(data) {
    if (btcEl && data.bitcoin) btcEl.innerText = `$${data.bitcoin.usd.toLocaleString('en-US')}`;
    if (ethEl && data.ethereum) ethEl.innerText = `$${data.ethereum.usd.toLocaleString('en-US')}`;
}
 function populateCurrencyOptions(currencies)  {
    if (!fromSelect || !toSelect) return;

    currencies.forEach(currency => {
        const optionFrom = new Option(currency, currency);
        const optionTo = new Option(currency, currency);
        fromSelect.add(optionFrom);
        toSelect.add(optionTo);
    });

    fromSelect.value = 'USD';
    toSelect.value = 'EUR';
 }
function calculateConversion() {
    if (!amountInput || !fromSelect ||  !toSelect || !resultBox) return;

    const amount =  parseFloat(amountInput.value);
    const from = fromSelect.value;
    const to  = toSelect.value;

    if (isNaN(amount) || amount <= 0) {
        resultBox.innerText = 'Please enter a valid amount';
        return;
    }
    if (!cachedRates) {
        resultBox.innerText = 'Rates data not ready';
        return;
    }
    const rateInUSD = cachedRates[from];
    const targetRate = cachedRates[to];

    if (!rateInUSD || !targetRate) {
        resultBox.innerText = 'Selected currency rate not found';
        return;
    }
    const  result = (amount / rateInUSD) * targetRate
    resultBox.innerText = `${amount.toLocaleString()} ${from} = ${result.toLocaleString('en-US', {maximumFractionDigits:2})} ${to}`;
}
function initApp() {
    fetchAllData().catch(err => console.error("Initialization failed", err));

    setInterval(() => {
        fetchAllData().catch(err => console.error("Interval fetch", err));
    }, 300000);

    if (convertBtn) {
        convertBtn.addEventListener('click', calculateConversion);
    }
}
window.addEventListener('DOMContentLoaded', initApp);