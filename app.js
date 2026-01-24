// Groq API (llamada directa desde navegador)
// La API key se guarda en localStorage para mantenerla privada
function getApiKey() {
    return localStorage.getItem('groqApiKey') || '';
}
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// OpenFoodFacts API - Base de datos mundial de alimentos (gratuita)
const OFF_API_URL = 'https://world.openfoodfacts.org/cgi/search.pl';

// Buscar alimento en OpenFoodFacts
async function searchOpenFoodFacts(searchTerm) {
    try {
        const params = new URLSearchParams({
            search_terms: searchTerm,
            search_simple: 1,
            action: 'process',
            json: 1,
            page_size: 10,
            fields: 'product_name,brands,nutriments,serving_size'
        });

        const response = await fetch(`${OFF_API_URL}?${params}`);
        if (!response.ok) return null;

        const data = await response.json();
        if (!data.products || data.products.length === 0) return null;

        // Buscar el mejor resultado (preferir con datos nutricionales completos)
        const product = data.products.find(p =>
            p.nutriments &&
            p.nutriments['energy-kcal_100g'] !== undefined
        ) || data.products[0];

        if (!product || !product.nutriments) return null;

        const n = product.nutriments;
        return {
            name: product.product_name || searchTerm,
            brand: product.brands || 'OpenFoodFacts',
            kcal: n['energy-kcal_100g'] || n['energy-kcal'] || 0,
            carbs: n['carbohydrates_100g'] || 0,
            protein: n['proteins_100g'] || 0,
            fat: n['fat_100g'] || 0
        };
    } catch (error) {
        console.error('Error buscando en OpenFoodFacts:', error);
        return null;
    }
}

// Estado de la Aplicación
let state = {
    // Objetivos personalizados
    goals: JSON.parse(localStorage.getItem('goals')) || {
        calories: 2000,
        carbs: 250,
        protein: 100,
        fat: 65
    },
    // Fecha actual seleccionada
    selectedDate: new Date(),
    // Historial de comidas por fecha (clave: 'YYYY-MM-DD')
    history: JSON.parse(localStorage.getItem('foodHistory')) || {},
    // Mes del calendario
    calendarDate: new Date(),
    debugMode: false
};

// Helpers de fecha
function formatDateKey(date) {
    return date.toISOString().split('T')[0]; // 'YYYY-MM-DD'
}

function formatDateDisplay(date) {
    return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
}

function isToday(date) {
    const today = new Date();
    return formatDateKey(date) === formatDateKey(today);
}

// Categorías de comidas
const MEAL_CATEGORIES = {
    breakfast: { label: 'Desayuno', icon: '🌅', order: 1 },
    lunch: { label: 'Comida', icon: '☀️', order: 2 },
    dinner: { label: 'Cena', icon: '🌙', order: 3 },
    other: { label: 'Otros', icon: '🍿', order: 4 }
};

// Obtener comidas del día seleccionado
function getFoodsForDate(date) {
    const key = formatDateKey(date);
    // Estructura: { breakfast: [], lunch: [], dinner: [], other: [] }
    return state.history[key] || { breakfast: [], lunch: [], dinner: [], other: [] };
}

// Guardar comidas del día seleccionado
function saveFoodsForDate(date, foods) {
    const key = formatDateKey(date);
    state.history[key] = foods;
    localStorage.setItem('foodHistory', JSON.stringify(state.history));
}

// Migrar datos antiguos (array) al nuevo formato (objeto con categorías)
function migrateOldData() {
    Object.keys(state.history).forEach(key => {
        if (Array.isArray(state.history[key])) {
            // Migrar al nuevo formato, poniendo todo en "other"
            state.history[key] = {
                breakfast: [],
                lunch: [],
                dinner: [],
                other: state.history[key]
            };
        }
    });
    localStorage.setItem('foodHistory', JSON.stringify(state.history));
}

// Obtener todos los alimentos de un día (todas las categorías)
function getAllFoodsForDate(date) {
    const dayData = getFoodsForDate(date);
    return [
        ...dayData.breakfast,
        ...dayData.lunch,
        ...dayData.dinner,
        ...dayData.other
    ];
}

// Elementos del DOM
const currentDateEl = document.getElementById('currentDate');
const currentCaloriesEl = document.getElementById('currentCalories');
const goalCaloriesEl = document.getElementById('goalCalories');
const goalPercentEl = document.getElementById('goalPercent');
const carbsValueEl = document.getElementById('carbsValue');
const proteinValueEl = document.getElementById('proteinValue');
const fatValueEl = document.getElementById('fatValue');
const goalCarbsEl = document.getElementById('goalCarbs');
const goalProteinEl = document.getElementById('goalProtein');
const goalFatEl = document.getElementById('goalFat');
const searchModal = document.getElementById('searchModal');
const closeSearchBtn = document.getElementById('closeSearchBtn');
const mealCategorySelect = document.getElementById('mealCategorySelect');

// Listas de comidas por categoría
const foodLists = {
    breakfast: document.getElementById('breakfast-list'),
    lunch: document.getElementById('lunch-list'),
    dinner: document.getElementById('dinner-list'),
    other: document.getElementById('other-list')
};

// Kcal por categoría
const mealKcalEls = {
    breakfast: document.getElementById('breakfast-kcal'),
    lunch: document.getElementById('lunch-kcal'),
    dinner: document.getElementById('dinner-kcal'),
    other: document.getElementById('other-kcal')
};

// Categoría actualmente seleccionada
let currentMealCategory = 'breakfast';

// Elementos del modo búsqueda (IA)
const smartInput = document.getElementById('smartInput');
const smartBtn = document.getElementById('smartBtn');
const smartPreview = document.getElementById('smartPreview');

// Elementos del escáner de etiquetas
const scanBtn = document.getElementById('scanBtn');
const labelImage = document.getElementById('labelImage');
const scanPreview = document.getElementById('scanPreview');
const scannedImage = document.getElementById('scannedImage');
const scannedData = document.getElementById('scannedData');
const gramsInput = document.getElementById('gramsInput');
const addScannedBtn = document.getElementById('addScannedBtn');
const saveProductBtn = document.getElementById('saveProductBtn');

// Elementos de productos guardados
const savedProductsList = document.getElementById('savedProductsList');
const savedProductForm = document.getElementById('savedProductForm');
const savedProductInfo = document.getElementById('savedProductInfo');
const savedGramsInput = document.getElementById('savedGramsInput');
const addSavedBtn = document.getElementById('addSavedBtn');

// Variable para guardar los datos escaneados temporalmente
let scannedNutrients = null;
let selectedSavedProduct = null;

// Cargar productos guardados del localStorage
function getSavedProducts() {
    return JSON.parse(localStorage.getItem('savedProducts')) || [];
}

// Guardar productos en localStorage
function saveSavedProducts(products) {
    localStorage.setItem('savedProducts', JSON.stringify(products));
}

// Renderizar lista de productos guardados
function renderSavedProducts() {
    const products = getSavedProducts();
    if (products.length === 0) {
        savedProductsList.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;text-align:center">No hay productos guardados</p>';
        return;
    }

    savedProductsList.innerHTML = products.map((p, index) => `
        <div class="saved-product-item" onclick="selectSavedProduct(${index})" style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;margin-bottom:5px;background:var(--card-bg);border-radius:8px;cursor:pointer;border:1px solid transparent;transition:border 0.2s">
            <div style="flex:1">
                <strong style="font-size:0.9rem">${p.product}</strong>
                <small style="display:block;color:var(--text-dim)">${p.kcal} kcal/100g</small>
            </div>
            <button onclick="event.stopPropagation();deleteSavedProduct(${index})" style="background:none;border:none;color:#f5576c;cursor:pointer;padding:5px">✕</button>
        </div>
    `).join('');
}

// Navegación de fecha
const prevDayBtn = document.getElementById('prevDayBtn');
const nextDayBtn = document.getElementById('nextDayBtn');

// Settings
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const inputGoalCalories = document.getElementById('inputGoalCalories');
const inputGoalCarbs = document.getElementById('inputGoalCarbs');
const inputGoalProtein = document.getElementById('inputGoalProtein');
const inputGoalFat = document.getElementById('inputGoalFat');
const inputApiKey = document.getElementById('inputApiKey');

// Calendar
const calendarBtn = document.getElementById('calendarBtn');
const calendarModal = document.getElementById('calendarModal');
const closeCalendarBtn = document.getElementById('closeCalendarBtn');
const calendarGrid = document.getElementById('calendarGrid');
const calendarMonth = document.getElementById('calendarMonth');
const prevMonthBtn = document.getElementById('prevMonthBtn');
const nextMonthBtn = document.getElementById('nextMonthBtn');
const calendarSummary = document.getElementById('calendarSummary');


async function init() {
    migrateOldData(); // Migrar datos antiguos si existen
    updateDateDisplay();
    updateGoalsDisplay();
    updateUI();
    setupEventListeners();
}

function updateDateDisplay() {
    currentDateEl.textContent = formatDateDisplay(state.selectedDate);
}

function updateGoalsDisplay() {
    goalCaloriesEl.textContent = state.goals.calories;
    goalCarbsEl.textContent = state.goals.carbs;
    goalProteinEl.textContent = state.goals.protein;
    goalFatEl.textContent = state.goals.fat;

    // Actualizar inputs del modal de settings
    inputGoalCalories.value = state.goals.calories;
    inputGoalCarbs.value = state.goals.carbs;
    inputGoalProtein.value = state.goals.protein;
    inputGoalFat.value = state.goals.fat;

    // Mostrar API key guardada (oculta)
    const savedKey = getApiKey();
    if (savedKey) {
        inputApiKey.value = savedKey;
    }
}


function updateUI() {
    const dayData = getFoodsForDate(state.selectedDate);

    // Calcular totales del día (todas las categorías)
    const allFoods = getAllFoodsForDate(state.selectedDate);
    const totals = allFoods.reduce((acc, food) => {
        acc.calories += food.calories || 0;
        acc.carbs += food.carbs || 0;
        acc.protein += food.protein || 0;
        acc.fat += food.fat || 0;
        return acc;
    }, { calories: 0, carbs: 0, protein: 0, fat: 0 });

    currentCaloriesEl.textContent = Math.round(totals.calories);
    const percent = Math.min(Math.round((totals.calories / state.goals.calories) * 100), 100);
    goalPercentEl.textContent = `${percent}% del Objetivo`;

    carbsValueEl.textContent = Math.round(totals.carbs);
    proteinValueEl.textContent = Math.round(totals.protein);
    fatValueEl.textContent = Math.round(totals.fat);

    // Barras de progreso basadas en objetivos
    const carbsPercent = Math.min((totals.carbs / state.goals.carbs) * 100, 100);
    const proteinPercent = Math.min((totals.protein / state.goals.protein) * 100, 100);
    const fatPercent = Math.min((totals.fat / state.goals.fat) * 100, 100);

    document.querySelector('.fill.carbs').style.width = `${carbsPercent}%`;
    document.querySelector('.fill.protein').style.width = `${proteinPercent}%`;
    document.querySelector('.fill.fat').style.width = `${fatPercent}%`;

    // Actualizar cada categoría de comida
    ['breakfast', 'lunch', 'dinner', 'other'].forEach(category => {
        const foods = dayData[category] || [];
        const listEl = foodLists[category];
        const kcalEl = mealKcalEls[category];

        // Calcular kcal de esta categoría
        const categoryKcal = foods.reduce((sum, f) => sum + (f.calories || 0), 0);
        kcalEl.textContent = `${Math.round(categoryKcal)} kcal`;

        // Renderizar lista de alimentos
        if (foods.length === 0) {
            listEl.innerHTML = '<div class="empty-meal">Sin alimentos</div>';
        } else {
            listEl.innerHTML = foods.map((food, index) => `
                <div class="food-item">
                    <div class="food-info">
                        <h4>${food.label}</h4>
                        <p>${food.brand || 'Personalizado'} • ${food.quantity || '-'}g</p>
                    </div>
                    <div class="food-cals">${Math.round(food.calories)} kcal</div>
                    <button class="delete-btn" onclick="deleteFood('${category}', ${index})" style="background:none; border:none; color:#ff4081; cursor:pointer; margin-left:10px;">&times;</button>
                </div>
            `).join('');
        }
    });
}

// Abrir modal para añadir comida a una categoría específica
window.openAddFood = function(category) {
    currentMealCategory = category;
    mealCategorySelect.value = category;
    searchModal.classList.remove('hidden');
};

function setupEventListeners() {
    // Modal de búsqueda
    closeSearchBtn.onclick = () => {
        searchModal.classList.add('hidden');
        resetScanPreview();
    };
    mealCategorySelect.onchange = (e) => { currentMealCategory = e.target.value; };

    // Botón de búsqueda inteligente (IA)
    smartBtn.onclick = processSmartInput;

    // Escáner de etiquetas
    scanBtn.onclick = () => labelImage.click();
    labelImage.onchange = processLabelImage;
    addScannedBtn.onclick = addScannedFood;
    saveProductBtn.onclick = saveScannedProduct;

    // Productos guardados
    addSavedBtn.onclick = addSavedProduct;
    renderSavedProducts();

    // Navegación de fecha
    prevDayBtn.onclick = () => changeDate(-1);
    nextDayBtn.onclick = () => changeDate(1);

    // Settings
    settingsBtn.onclick = () => settingsModal.classList.remove('hidden');
    closeSettingsBtn.onclick = () => settingsModal.classList.add('hidden');
    saveSettingsBtn.onclick = saveSettings;

    // Calendar
    calendarBtn.onclick = () => { renderCalendar(); calendarModal.classList.remove('hidden'); };
    closeCalendarBtn.onclick = () => calendarModal.classList.add('hidden');
    prevMonthBtn.onclick = () => changeMonth(-1);
    nextMonthBtn.onclick = () => changeMonth(1);
}

function changeDate(delta) {
    state.selectedDate.setDate(state.selectedDate.getDate() + delta);
    updateDateDisplay();
    updateUI();
}

function saveSettings() {
    state.goals = {
        calories: parseInt(inputGoalCalories.value) || 2000,
        carbs: parseInt(inputGoalCarbs.value) || 250,
        protein: parseInt(inputGoalProtein.value) || 100,
        fat: parseInt(inputGoalFat.value) || 65
    };
    localStorage.setItem('goals', JSON.stringify(state.goals));

    // Guardar API key
    const apiKey = inputApiKey.value.trim();
    if (apiKey) {
        localStorage.setItem('groqApiKey', apiKey);
    }

    updateGoalsDisplay();
    updateUI();
    settingsModal.classList.add('hidden');
}

// Funciones del Calendario
function changeMonth(delta) {
    state.calendarDate.setMonth(state.calendarDate.getMonth() + delta);
    renderCalendar();
}

function renderCalendar() {
    const year = state.calendarDate.getFullYear();
    const month = state.calendarDate.getMonth();

    calendarMonth.textContent = state.calendarDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = (firstDay.getDay() + 6) % 7; // Lunes = 0

    let html = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => `<div class="calendar-day-header">${d}</div>`).join('');

    // Días vacíos al inicio
    for (let i = 0; i < startDayOfWeek; i++) {
        html += '<div class="calendar-day empty"></div>';
    }

    // Días del mes
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateKey = formatDateKey(date);
        const dayData = state.history[dateKey];
        const hasData = dayData && (
            (dayData.breakfast && dayData.breakfast.length > 0) ||
            (dayData.lunch && dayData.lunch.length > 0) ||
            (dayData.dinner && dayData.dinner.length > 0) ||
            (dayData.other && dayData.other.length > 0)
        );
        const isCurrentDay = formatDateKey(date) === formatDateKey(today);
        const isSelected = formatDateKey(date) === formatDateKey(state.selectedDate);

        let classes = 'calendar-day';
        if (hasData) classes += ' has-data';
        if (isCurrentDay) classes += ' today';
        if (isSelected) classes += ' selected';

        html += `<div class="${classes}" onclick="selectCalendarDay(${year}, ${month}, ${day})">${day}</div>`;
    }

    calendarGrid.innerHTML = html;
    updateCalendarSummary(state.selectedDate);
}

window.selectCalendarDay = function(year, month, day) {
    state.selectedDate = new Date(year, month, day);
    updateDateDisplay();
    updateUI();
    renderCalendar();
    updateCalendarSummary(state.selectedDate);
};

function updateCalendarSummary(date) {
    const allFoods = getAllFoodsForDate(date);

    if (allFoods.length === 0) {
        calendarSummary.innerHTML = '<p>No hay registros este día</p>';
        return;
    }

    const totals = allFoods.reduce((acc, food) => {
        acc.calories += food.calories || 0;
        acc.carbs += food.carbs || 0;
        acc.protein += food.protein || 0;
        acc.fat += food.fat || 0;
        return acc;
    }, { calories: 0, carbs: 0, protein: 0, fat: 0 });

    calendarSummary.innerHTML = `
        <h4>${formatDateDisplay(date)}</h4>
        <div class="stats">
            <div class="stat-item"><span>Calorías</span><span class="stat-value">${Math.round(totals.calories)} kcal</span></div>
            <div class="stat-item"><span>Carbs</span><span class="stat-value">${Math.round(totals.carbs)}g</span></div>
            <div class="stat-item"><span>Proteína</span><span class="stat-value">${Math.round(totals.protein)}g</span></div>
            <div class="stat-item"><span>Grasas</span><span class="stat-value">${Math.round(totals.fat)}g</span></div>
        </div>
        <p style="margin-top:0.5rem;font-size:0.8rem;color:var(--text-dim)">${allFoods.length} alimento(s) registrado(s)</p>
    `;
}

// Lógica Búsqueda Inteligente - IA con Groq + OpenFoodFacts
async function processSmartInput() {
    const rawText = smartInput.value.trim();
    if (!rawText) return;

    // Verificar que hay API key configurada
    if (!getApiKey()) {
        alert('Necesitas configurar tu API Key de Groq.\n\nVe a Configuración (⚙️) y pega tu API key.\n\nPuedes obtenerla gratis en: console.groq.com/keys');
        return;
    }

    // Deshabilitar botón mientras procesa
    smartBtn.textContent = 'Analizando...';
    smartBtn.disabled = true;

    try {
        // PASO 1: La IA interpreta qué alimentos y cantidades hay
        const grokResponse = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getApiKey()}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{
                    role: 'user',
                    content: `Analiza esta descripción de comida e identifica los alimentos y sus cantidades:

"${rawText}"

INSTRUCCIONES:
1. Si el usuario indica gramos/ml/cantidad específica, USA EXACTAMENTE esa cantidad
2. Si NO especifica cantidad, estima una porción típica
3. Devuelve los nombres de alimentos en español e inglés para mejor búsqueda

Ejemplos:
- "200g de arroz con pollo" → arroz/rice 200g, pollo/chicken 150g
- "2 huevos fritos" → huevo/egg 120g (2x60g)
- "tostada con aceite" → pan/bread 30g, aceite de oliva/olive oil 10g
- "un plátano" → plátano/banana 120g

Responde SOLO con este JSON (sin texto adicional):
{"items": [{"food_es": "nombre en español", "food_en": "name in english", "grams": número}]}`
                }],
                temperature: 0.1
            })
        });

        if (!grokResponse.ok) {
            throw new Error(`Error de API: ${grokResponse.status}`);
        }

        const grokData = await grokResponse.json();
        const grokContent = grokData.choices[0].message.content;

        // Parsear respuesta de la IA
        let parsed;
        try {
            const jsonMatch = grokContent.match(/\{[\s\S]*\}/);
            parsed = JSON.parse(jsonMatch ? jsonMatch[0] : grokContent);
        } catch (e) {
            throw new Error('Error interpretando la comida');
        }

        if (!parsed.items || parsed.items.length === 0) {
            throw new Error('No se detectaron alimentos');
        }

        // PASO 2: Pedir valores nutricionales a la IA (más precisa para alimentos naturales)
        const processedFoods = [];
        const totals = { kcal: 0, carbs: 0, protein: 0, fat: 0 };

        smartBtn.textContent = 'Calculando nutrientes...';

        // Pedir todos los valores nutricionales en una sola llamada a la IA
        const foodNames = parsed.items.map(i => i.food_es || i.food).join(', ');
        const nutrientResponse = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getApiKey()}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{
                    role: 'user',
                    content: `Dame los valores nutricionales por 100g de estos alimentos: ${foodNames}

IMPORTANTE: Usa datos de tablas nutricionales oficiales (BEDCA, USDA).
Valores de referencia típicos:
- Huevo: 155 kcal, 1.1g carbs, 13g proteína, 11g grasa
- Arroz cocido: 130 kcal, 28g carbs, 2.7g proteína, 0.3g grasa
- Pollo: 165 kcal, 0g carbs, 31g proteína, 3.6g grasa
- Pan: 265 kcal, 49g carbs, 9g proteína, 3.2g grasa
- Aceite de oliva: 884 kcal, 0g carbs, 0g proteína, 100g grasa

Responde SOLO con este JSON (sin texto adicional):
{"foods": [{"name": "nombre", "kcal": número, "carbs": número, "protein": número, "fat": número}]}`
                }],
                temperature: 0.1
            })
        });

        let nutrientData = { foods: [] };
        if (nutrientResponse.ok) {
            const respData = await nutrientResponse.json();
            const jsonMatch = respData.choices[0].message.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try { nutrientData = JSON.parse(jsonMatch[0]); } catch(e) {}
            }
        }

        for (let i = 0; i < parsed.items.length; i++) {
            const item = parsed.items[i];
            const grams = item.grams || 100;
            const ratio = grams / 100;

            // Buscar en la respuesta de la IA o usar valores por defecto
            const nutrient = nutrientData.foods[i] || { kcal: 100, carbs: 15, protein: 5, fat: 3 };

            const food = {
                name: item.food_es || item.food,
                grams: grams,
                kcal: Math.round(nutrient.kcal * ratio),
                carbs: Math.round(nutrient.carbs * ratio * 10) / 10,
                protein: Math.round(nutrient.protein * ratio * 10) / 10,
                fat: Math.round(nutrient.fat * ratio * 10) / 10,
                source: 'IA'
            };
            processedFoods.push(food);
            totals.kcal += food.kcal;
            totals.carbs += food.carbs;
            totals.protein += food.protein;
            totals.fat += food.fat;
        }

        // Construir el resumen
        const components = processedFoods.map(f => `${f.name} (${f.grams}g)`);
        const sources = [...new Set(processedFoods.map(f => f.source))].join(' + ');

        // Añadir a la categoría seleccionada del día
        const dayData = getFoodsForDate(state.selectedDate);
        if (!dayData[currentMealCategory]) {
            dayData[currentMealCategory] = [];
        }
        dayData[currentMealCategory].push({
            label: components.join(' + '),
            calories: totals.kcal,
            carbs: totals.carbs,
            protein: totals.protein,
            fat: totals.fat,
            brand: sources,
            quantity: processedFoods.reduce((sum, f) => sum + f.grams, 0),
            id: Date.now()
        });
        saveFoodsForDate(state.selectedDate, dayData);

        updateUI();
        smartPreview.innerHTML = `
            <strong>Añadido:</strong> ${components.join(' + ')}<br>
            <strong>Total: ${Math.round(totals.kcal)} kcal</strong><br>
            <small>Carbs: ${Math.round(totals.carbs)}g | Prot: ${Math.round(totals.protein)}g | Grasa: ${Math.round(totals.fat)}g</small><br>
            <small style="color:#888">Fuente: ${sources}</small>
        `;
        smartPreview.classList.remove('hidden');

        setTimeout(() => {
            searchModal.classList.add('hidden');
            smartInput.value = '';
            smartPreview.classList.add('hidden');
        }, 3000);

    } catch (error) {
        alert(`Error al procesar: ${error.message}\n\nIntenta de nuevo.`);
    } finally {
        smartBtn.textContent = 'Estimar y Añadir';
        smartBtn.disabled = false;
    }
}

// Resetear vista del escáner
function resetScanPreview() {
    scanPreview.classList.add('hidden');
    scannedImage.src = '';
    scannedData.innerHTML = '';
    gramsInput.value = '';
    scannedNutrients = null;
    labelImage.value = '';
    // También resetear productos guardados
    savedProductForm.classList.add('hidden');
    selectedSavedProduct = null;
    savedGramsInput.value = '';
}

// Procesar imagen de etiqueta nutricional
async function processLabelImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Verificar API key
    if (!getApiKey()) {
        alert('Necesitas configurar tu API Key de Groq.\n\nVe a Configuración (⚙️) y pega tu API key.');
        return;
    }

    // Mostrar imagen capturada
    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64Image = e.target.result;
        scannedImage.src = base64Image;
        scanPreview.classList.remove('hidden');
        scannedData.innerHTML = '<p style="text-align:center">Analizando etiqueta...</p>';

        try {
            // Enviar imagen al modelo de visión de Groq
            const response = await fetch(GROQ_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getApiKey()}`
                },
                body: JSON.stringify({
                    model: 'llama-3.2-90b-vision-preview',
                    messages: [{
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: `Analiza esta etiqueta nutricional y extrae los valores por 100g (o por porción si no hay por 100g).

Necesito EXACTAMENTE estos datos:
- Nombre del producto (si es visible)
- Calorías (kcal)
- Carbohidratos (g)
- Proteínas (g)
- Grasas (g)

Responde SOLO con este JSON (sin texto adicional):
{"product": "nombre del producto", "per": "100g o porción", "kcal": número, "carbs": número, "protein": número, "fat": número}`
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: base64Image
                                }
                            }
                        ]
                    }],
                    temperature: 0.1,
                    max_tokens: 500
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || `Error de API: ${response.status}`);
            }

            const data = await response.json();
            const content = data.choices[0].message.content;

            // Parsear respuesta
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No se pudo leer la etiqueta');
            }

            scannedNutrients = JSON.parse(jsonMatch[0]);

            // Mostrar datos extraídos
            scannedData.innerHTML = `
                <h4 style="margin:0 0 10px;color:var(--primary)">${scannedNutrients.product || 'Producto'}</h4>
                <p style="margin:5px 0;font-size:0.85rem;color:var(--text-dim)">Valores por ${scannedNutrients.per || '100g'}:</p>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:0.9rem">
                    <span>Calorías:</span><strong>${scannedNutrients.kcal} kcal</strong>
                    <span>Carbos:</span><strong>${scannedNutrients.carbs}g</strong>
                    <span>Proteína:</span><strong>${scannedNutrients.protein}g</strong>
                    <span>Grasas:</span><strong>${scannedNutrients.fat}g</strong>
                </div>
            `;
            gramsInput.focus();

        } catch (error) {
            console.error('Error procesando imagen:', error);
            scannedData.innerHTML = `<p style="color:#f5576c">Error: ${error.message}</p><p style="font-size:0.8rem">Intenta con otra foto más clara de la etiqueta.</p>`;
        }
    };
    reader.readAsDataURL(file);
}

// Añadir alimento escaneado
function addScannedFood() {
    if (!scannedNutrients) {
        alert('Primero escanea una etiqueta');
        return;
    }

    const grams = parseFloat(gramsInput.value);
    if (!grams || grams <= 0) {
        alert('Introduce los gramos que vas a comer');
        gramsInput.focus();
        return;
    }

    // Calcular según los gramos (los datos vienen por 100g normalmente)
    const ratio = grams / 100;
    const calculated = {
        kcal: Math.round(scannedNutrients.kcal * ratio),
        carbs: Math.round(scannedNutrients.carbs * ratio * 10) / 10,
        protein: Math.round(scannedNutrients.protein * ratio * 10) / 10,
        fat: Math.round(scannedNutrients.fat * ratio * 10) / 10
    };

    // Añadir a la categoría seleccionada
    const dayData = getFoodsForDate(state.selectedDate);
    if (!dayData[currentMealCategory]) {
        dayData[currentMealCategory] = [];
    }
    dayData[currentMealCategory].push({
        label: `${scannedNutrients.product || 'Producto escaneado'} (${grams}g)`,
        calories: calculated.kcal,
        carbs: calculated.carbs,
        protein: calculated.protein,
        fat: calculated.fat,
        brand: 'Etiqueta escaneada',
        quantity: grams,
        id: Date.now()
    });
    saveFoodsForDate(state.selectedDate, dayData);

    // Mostrar confirmación
    smartPreview.innerHTML = `
        <strong>Añadido:</strong> ${scannedNutrients.product || 'Producto'} (${grams}g)<br>
        <strong>Total: ${calculated.kcal} kcal</strong><br>
        <small>Carbs: ${calculated.carbs}g | Prot: ${calculated.protein}g | Grasa: ${calculated.fat}g</small>
    `;
    smartPreview.classList.remove('hidden');

    updateUI();
    resetScanPreview();

    setTimeout(() => {
        searchModal.classList.add('hidden');
        smartPreview.classList.add('hidden');
    }, 2500);
}

// Guardar producto escaneado para futuro uso
function saveScannedProduct() {
    if (!scannedNutrients) {
        alert('Primero escanea una etiqueta');
        return;
    }

    const products = getSavedProducts();

    // Verificar si ya existe
    const exists = products.some(p => p.product === scannedNutrients.product);
    if (exists) {
        alert('Este producto ya está guardado');
        return;
    }

    products.push({
        product: scannedNutrients.product || 'Producto',
        kcal: scannedNutrients.kcal,
        carbs: scannedNutrients.carbs,
        protein: scannedNutrients.protein,
        fat: scannedNutrients.fat,
        per: scannedNutrients.per || '100g'
    });

    saveSavedProducts(products);
    renderSavedProducts();
    alert('Producto guardado');
}

// Seleccionar un producto guardado
window.selectSavedProduct = function(index) {
    const products = getSavedProducts();
    selectedSavedProduct = products[index];

    savedProductInfo.innerHTML = `
        <strong>${selectedSavedProduct.product}</strong>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;font-size:0.85rem;margin-top:5px">
            <span>Kcal:</span><span>${selectedSavedProduct.kcal}/100g</span>
            <span>Carbos:</span><span>${selectedSavedProduct.carbs}g</span>
            <span>Prot:</span><span>${selectedSavedProduct.protein}g</span>
            <span>Grasa:</span><span>${selectedSavedProduct.fat}g</span>
        </div>
    `;
    savedProductForm.classList.remove('hidden');
    savedGramsInput.value = '';
    savedGramsInput.focus();
};

// Eliminar producto guardado
window.deleteSavedProduct = function(index) {
    if (confirm('¿Eliminar este producto?')) {
        const products = getSavedProducts();
        products.splice(index, 1);
        saveSavedProducts(products);
        renderSavedProducts();
        savedProductForm.classList.add('hidden');
        selectedSavedProduct = null;
    }
};

// Añadir producto guardado
function addSavedProduct() {
    if (!selectedSavedProduct) {
        alert('Selecciona un producto de la lista');
        return;
    }

    const grams = parseFloat(savedGramsInput.value);
    if (!grams || grams <= 0) {
        alert('Introduce los gramos');
        savedGramsInput.focus();
        return;
    }

    const ratio = grams / 100;
    const calculated = {
        kcal: Math.round(selectedSavedProduct.kcal * ratio),
        carbs: Math.round(selectedSavedProduct.carbs * ratio * 10) / 10,
        protein: Math.round(selectedSavedProduct.protein * ratio * 10) / 10,
        fat: Math.round(selectedSavedProduct.fat * ratio * 10) / 10
    };

    const dayData = getFoodsForDate(state.selectedDate);
    if (!dayData[currentMealCategory]) {
        dayData[currentMealCategory] = [];
    }
    dayData[currentMealCategory].push({
        label: `${selectedSavedProduct.product} (${grams}g)`,
        calories: calculated.kcal,
        carbs: calculated.carbs,
        protein: calculated.protein,
        fat: calculated.fat,
        brand: 'Producto guardado',
        quantity: grams,
        id: Date.now()
    });
    saveFoodsForDate(state.selectedDate, dayData);

    smartPreview.innerHTML = `
        <strong>Añadido:</strong> ${selectedSavedProduct.product} (${grams}g)<br>
        <strong>Total: ${calculated.kcal} kcal</strong><br>
        <small>Carbs: ${calculated.carbs}g | Prot: ${calculated.protein}g | Grasa: ${calculated.fat}g</small>
    `;
    smartPreview.classList.remove('hidden');

    updateUI();
    savedProductForm.classList.add('hidden');
    selectedSavedProduct = null;
    savedGramsInput.value = '';

    setTimeout(() => {
        searchModal.classList.add('hidden');
        smartPreview.classList.add('hidden');
    }, 2500);
}

window.deleteFood = (category, index) => {
    const dayData = getFoodsForDate(state.selectedDate);
    if (dayData[category]) {
        dayData[category].splice(index, 1);
        saveFoodsForDate(state.selectedDate, dayData);
        updateUI();
    }
};

init();
