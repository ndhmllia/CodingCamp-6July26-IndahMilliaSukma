/* ============================================================
   EXPENSE & BUDGET VISUALIZER — script.js
   ============================================================ */

/* ----------------------------------------------------------
   HELPERS
   ---------------------------------------------------------- */

/**
 * Format a number as Indonesian Rupiah.
 * e.g. 25000 → "Rp 25.000"
 */
function formatRupiah(amount) {
  return 'Rp ' + amount.toLocaleString('id-ID');
}

/**
 * Return the CSS class suffix for a given category.
 * Used to apply the correct badge color from style.css.
 */
function getCategoryClass(category) {
  const map = {
    Food     : 'food',
    Transport: 'transport',
    Fun      : 'fun'
  };
  return map[category] || 'food';
}

/* ----------------------------------------------------------
   STEP 1 — Element Selection & Form Validation
   ---------------------------------------------------------- */

// --- 1a. Select DOM elements ---
const expenseForm    = document.getElementById('expenseForm');
const itemNameInput  = document.getElementById('itemName');
const itemAmountInput= document.getElementById('itemAmount');
const itemCategoryInput = document.getElementById('itemCategory');

const totalBalanceEl = document.getElementById('totalBalance');
const transactionList= document.getElementById('transactionList');
const emptyState     = document.getElementById('emptyState');
const chartEmptyState= document.getElementById('chartEmptyState');
const chartCanvas    = document.getElementById('expenseChart');

// --- 1b. In-memory data store ---
let transactions = [];   // will hold transaction objects

// --- 1c. Form submit handler ---
expenseForm.addEventListener('submit', function (event) {
  event.preventDefault();   // stop the browser from reloading the page

  // Read and trim input values
  const name     = itemNameInput.value.trim();
  const amount   = parseFloat(itemAmountInput.value);
  const category = itemCategoryInput.value;

  // --- Validation ---
  if (name === '') {
    alert('Please enter an item name.');
    itemNameInput.focus();
    return;
  }

  if (isNaN(amount) || amount <= 0) {
    alert('Please enter a valid amount greater than 0.');
    itemAmountInput.focus();
    return;
  }

  if (category === '') {
    alert('Please select a category.');
    itemCategoryInput.focus();
    return;
  }

  // --- Build transaction object ---
  const transaction = {
    id      : Date.now(),          // unique timestamp-based ID
    name    : name,
    amount  : amount,
    category: category
  };

  // --- Add to array ---
  transactions.push(transaction);

  // --- Debug output ---
  console.log('New transaction added:', transaction);
  console.log('All transactions:', transactions);

  // --- Persist & update UI ---
  saveToStorage();
  renderTransactions();
  updateBalance();
  updateChart();

  // --- Reset form ---
  expenseForm.reset();
  itemNameInput.focus();   // return focus to first field for quick entry
});

/* ----------------------------------------------------------
   STEP 2 — Render Transaction List
   ---------------------------------------------------------- */

/**
 * Rebuild the visible transaction list from the transactions array.
 * - Shows each transaction as a styled list item.
 * - Toggles the empty-state message based on array length.
 */
function renderTransactions() {
  // Clear existing list items
  transactionList.innerHTML = '';

  if (transactions.length === 0) {
    // No transactions — show the empty-state message
    emptyState.style.display = 'block';
    return;
  }

  // Transactions exist — hide the empty-state message
  emptyState.style.display = 'none';

  // Build one <li> per transaction
  transactions.forEach(function (transaction) {
    const categoryClass = getCategoryClass(transaction.category);

    const li = document.createElement('li');
    li.classList.add('transaction-item');
    li.dataset.id = transaction.id;   // store ID for future delete use

    li.innerHTML = `
      <div class="transaction-info">
        <span class="transaction-name">${transaction.name}</span>
        <span class="badge badge-${categoryClass}">${transaction.category}</span>
      </div>
      <span class="transaction-amount">${formatRupiah(transaction.amount)}</span>
      <button
        class="btn-delete"
        data-id="${transaction.id}"
        aria-label="Delete ${transaction.name}"
        title="Delete"
      >&#x2715;</button>
    `;

    transactionList.appendChild(li);
  });
}

/* ----------------------------------------------------------
   STEP 3 — Delete Transaction
   ---------------------------------------------------------- */

/**
 * Remove a transaction from the array by its id, then re-render.
 * @param {number} id - The id stored in the transaction object.
 */
function deleteTransaction(id) {
  // Keep every item whose id does NOT match — effectively removes the target
  transactions = transactions.filter(function (t) {
    return t.id !== id;
  });

  console.log('Transaction deleted. Remaining:', transactions);

  // Persist & rebuild UI
  saveToStorage();
  renderTransactions();
  updateBalance();
  updateChart();
}

// Event delegation — one listener on the <ul> catches clicks from any delete button
transactionList.addEventListener('click', function (event) {
  const btn = event.target.closest('.btn-delete');
  if (!btn) return;   // click was not on a delete button — ignore

  // dataset values are always strings; convert to number to match the id type
  const id = Number(btn.dataset.id);
  deleteTransaction(id);
});

/* ----------------------------------------------------------
   STEP 4 — Total Balance
   ---------------------------------------------------------- */

/**
 * Sum all transaction amounts and display the result in the header.
 * Falls back to "Rp 0" when the transactions array is empty.
 */
function updateBalance() {
  const total = transactions.reduce(function (sum, t) {
    return sum + t.amount;
  }, 0);

  totalBalanceEl.textContent = formatRupiah(total);
}

/* ----------------------------------------------------------
   STEP 5 — Local Storage
   ---------------------------------------------------------- */

const STORAGE_KEY = 'expenses';

/**
 * Persist the current transactions array to localStorage.
 * Called every time the array is mutated (add or delete).
 */
function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

/**
 * Load transactions from localStorage on page start.
 * If no data exists yet, the array stays empty and the
 * empty-state message remains visible.
 */
function loadFromStorage() {
  const stored = localStorage.getItem(STORAGE_KEY);

  if (stored) {
    try {
      transactions = JSON.parse(stored);
    } catch (e) {
      // Corrupted data — start fresh
      console.warn('Could not parse stored transactions. Starting fresh.', e);
      transactions = [];
    }
  }

  renderTransactions();
  updateBalance();
  updateChart();
}

/* ----------------------------------------------------------
   STEP 6 — Chart.js Pie Chart
   ---------------------------------------------------------- */

// Category metadata: display order, label, and color
const CATEGORIES = [
  { key: 'Food',      color: '#F2B880' },
  { key: 'Transport', color: '#8DB6A0' },
  { key: 'Fun',       color: '#D7C49E' }
];

// Chart instance — created once, updated in place on every data change
let expenseChart = null;

/**
 * Calculate the total spent per category from the transactions array.
 * Returns an array of numbers aligned with CATEGORIES order.
 */
function getCategoryTotals() {
  return CATEGORIES.map(function (cat) {
    return transactions
      .filter(function (t) { return t.category === cat.key; })
      .reduce(function (sum, t) { return sum + t.amount; }, 0);
  });
}

/**
 * Create the Chart.js pie chart once and attach it to the canvas.
 * Subsequent updates call updateChart() instead.
 */
function initChart() {
  expenseChart = new Chart(chartCanvas, {
    type: 'pie',
    data: {
      labels  : CATEGORIES.map(function (c) { return c.key; }),
      datasets: [{
        data           : getCategoryTotals(),
        backgroundColor: CATEGORIES.map(function (c) { return c.color; }),
        borderColor    : '#ffffff',
        borderWidth    : 3,
        borderRadius   : 8,
        hoverOffset    : 18
      }]
    },
    options: {
      responsive         : true,
      maintainAspectRatio: true,
      // Breathing room around the pie
      layout: {
        padding: 20
      },
      // Smooth fade + grow animation on data change
      animation: {
        animateRotate : true,
        animateScale  : true,
        duration      : 600,
        easing        : 'easeInOutQuart'
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels  : {
            font            : { size: 13, family: "'Plus Jakarta Sans', system-ui, sans-serif", weight: '600' },
            padding         : 20,
            usePointStyle   : true,
            pointStyle      : 'circle',
            pointStyleWidth : 10,
            color           : '#5C6E63'
          }
        },
        tooltip: {
          backgroundColor : 'rgba(255, 255, 255, 0.95)',
          titleColor      : '#1E2D24',
          bodyColor       : '#5C6E63',
          borderColor     : '#E9E6DF',
          borderWidth     : 1,
          padding         : 12,
          cornerRadius    : 12,
          boxPadding      : 6,
          titleFont       : { size: 13, weight: '700', family: "'Plus Jakarta Sans', system-ui, sans-serif" },
          bodyFont        : { size: 13, weight: '500', family: "'Plus Jakarta Sans', system-ui, sans-serif" },
          callbacks: {
            // Show formatted Rupiah in the tooltip instead of raw numbers
            label: function (context) {
              const value = context.parsed;
              return '  ' + context.label + ': ' + formatRupiah(value);
            }
          }
        }
      }
    }
  });
}

/**
 * Refresh chart data and toggle the chart empty-state message.
 * Called whenever the transactions array changes.
 */
function updateChart() {
  const totals    = getCategoryTotals();
  const hasData   = totals.some(function (v) { return v > 0; });

  // Toggle empty-state message
  chartEmptyState.style.display = hasData ? 'none'  : 'block';
  chartCanvas.style.display     = hasData ? 'block' : 'none';

  if (!hasData) return;   // nothing to draw

  // Push fresh data into the existing chart instance and re-render with animation
  expenseChart.data.datasets[0].data = totals;
  expenseChart.update('active');
}

// --- Run on page load ---
// 1. Build the chart instance first so updateChart() can reference it
initChart();
// 2. Hide canvas until real data arrives
chartCanvas.style.display = 'none';
// 3. Load persisted data — this calls renderTransactions, updateBalance, updateChart
loadFromStorage();
