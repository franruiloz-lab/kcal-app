// Groq API (llamada directa desde navegador)
const GROQ_API_KEY = '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';
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
    closeSearchBtn.onclick = () => searchModal.classList.add('hidden');
    mealCategorySelect.onchange = (e) => { currentMealCategory = e.target.value; };

    // Botón de búsqueda inteligente (IA)
    smartBtn.onclick = processSmartInput;

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
    updateGoalsDisplay();
    updateUI();
    settingsModal.classList.add('hidden');
    // addLog('Objetivos guardados', 'info');
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

    // Deshabilitar botón mientras procesa
    smartBtn.textContent = 'Analizando...';
    smartBtn.disabled = true;

    try {
        // PASO 1: La IA interpreta qué alimentos y cantidades hay
        const grokResponse = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
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
                'Authorization': `Bearer ${GROQ_API_KEY}`
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

window.deleteFood = (category, index) => {
    const dayData = getFoodsForDate(state.selectedDate);
    if (dayData[category]) {
        dayData[category].splice(index, 1);
        saveFoodsForDate(state.selectedDate, dayData);
        updateUI();
    }
};

init();
