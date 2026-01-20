// Groq API (llamada directa desde navegador)
const GROQ_API_KEY = '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';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// URL de la base de datos BEDCA (cambiar a Vercel cuando se despliegue)
const BEDCA_URL = './bedca.json';

// Cache de la base de datos
let bedcaDB = null;

// Cargar base de datos BEDCA
async function loadBEDCA() {
    if (bedcaDB) return bedcaDB;
    try {
        const response = await fetch(BEDCA_URL);
        bedcaDB = await response.json();
        console.log(`BEDCA cargada: ${bedcaDB.foods.length} alimentos`);
        return bedcaDB;
    } catch (error) {
        console.error('Error cargando BEDCA:', error);
        return null;
    }
}

// Buscar alimento en BEDCA por nombre/keyword
function findInBEDCA(searchTerm) {
    if (!bedcaDB) return null;
    const term = searchTerm.toLowerCase().trim();

    // Buscar coincidencia exacta primero
    let found = bedcaDB.foods.find(food =>
        food.name.toLowerCase() === term ||
        food.keywords.some(kw => kw.toLowerCase() === term)
    );

    // Si no hay exacta, buscar parcial
    if (!found) {
        found = bedcaDB.foods.find(food =>
            food.name.toLowerCase().includes(term) ||
            term.includes(food.name.toLowerCase()) ||
            food.keywords.some(kw => term.includes(kw.toLowerCase()) || kw.toLowerCase().includes(term))
        );
    }

    return found;
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
    await loadBEDCA(); // Cargar base de datos BEDCA
    migrateOldData(); // Migrar datos antiguos si existen
    updateDateDisplay();
    updateGoalsDisplay();
    updateUI();
    setupEventListeners();
    // addLog('CalorieTrack v4 - Búsqueda inteligente con IA', 'info');
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

// Lógica Búsqueda Inteligente - IA con Groq
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
3. Devuelve SOLO los nombres de alimentos simples/genéricos (ej: "arroz", "pollo", "huevo")

Ejemplos:
- "200g de arroz con pollo" → arroz 200g, pollo 150g (estimado)
- "2 huevos fritos" → huevo 120g (2x60g)
- "tostada con aceite" → tostada 30g, aceite 10g
- "un plátano" → plátano 120g

Responde SOLO con este JSON (sin texto adicional):
{"items": [{"food": "nombre simple del alimento", "grams": número}]}`
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

        // PASO 2: Buscar cada alimento en BEDCA y calcular nutrientes
        const processedFoods = [];
        const totals = { kcal: 0, carbs: 0, protein: 0, fat: 0 };

        for (const item of parsed.items) {
            const bedcaFood = findInBEDCA(item.food);
            const grams = item.grams || 100;

            if (bedcaFood) {
                // Encontrado en BEDCA - calcular proporcionalmente
                const ratio = grams / 100;
                const food = {
                    name: bedcaFood.name,
                    grams: grams,
                    kcal: Math.round(bedcaFood.kcal * ratio),
                    carbs: Math.round(bedcaFood.carbs * ratio * 10) / 10,
                    protein: Math.round(bedcaFood.protein * ratio * 10) / 10,
                    fat: Math.round(bedcaFood.fat * ratio * 10) / 10,
                    source: 'BEDCA'
                };
                processedFoods.push(food);
                totals.kcal += food.kcal;
                totals.carbs += food.carbs;
                totals.protein += food.protein;
                totals.fat += food.fat;
            } else {
                // No encontrado en BEDCA - usar estimación genérica
                // Pedir a la IA que estime este alimento específico
                const estimateResponse = await fetch(GROQ_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${GROQ_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: 'llama-3.3-70b-versatile',
                        messages: [{
                            role: 'user',
                            content: `Dame los valores nutricionales de "${item.food}" por 100g.
Responde SOLO con JSON: {"kcal": número, "carbs": número, "protein": número, "fat": número}`
                        }],
                        temperature: 0.1
                    })
                });

                let estimated = { kcal: 100, carbs: 15, protein: 5, fat: 3 }; // fallback
                if (estimateResponse.ok) {
                    const estData = await estimateResponse.json();
                    const estMatch = estData.choices[0].message.content.match(/\{[\s\S]*\}/);
                    if (estMatch) {
                        try { estimated = JSON.parse(estMatch[0]); } catch(e) {}
                    }
                }

                const ratio = grams / 100;
                const food = {
                    name: item.food,
                    grams: grams,
                    kcal: Math.round(estimated.kcal * ratio),
                    carbs: Math.round(estimated.carbs * ratio * 10) / 10,
                    protein: Math.round(estimated.protein * ratio * 10) / 10,
                    fat: Math.round(estimated.fat * ratio * 10) / 10,
                    source: 'IA'
                };
                processedFoods.push(food);
                totals.kcal += food.kcal;
                totals.carbs += food.carbs;
                totals.protein += food.protein;
                totals.fat += food.fat;
            }
        }

        // Construir el resumen
        const components = processedFoods.map(f => `${f.name} (${f.grams}g)`);

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
            brand: processedFoods.every(f => f.source === 'BEDCA') ? 'BEDCA' : 'BEDCA + IA',
            quantity: 1,
            id: Date.now()
        });
        saveFoodsForDate(state.selectedDate, dayData);

        updateUI();
        smartPreview.innerHTML = `
            <strong>Añadido:</strong> ${components.join(' + ')}<br>
            <strong>Total: ${Math.round(totals.kcal)} kcal</strong><br>
            <small>Carbs: ${Math.round(totals.carbs)}g | Prot: ${Math.round(totals.protein)}g | Grasa: ${Math.round(totals.fat)}g</small>
        `;
        smartPreview.classList.remove('hidden');

        setTimeout(() => {
            searchModal.classList.add('hidden');
            smartInput.value = '';
            smartPreview.classList.add('hidden');
        }, 3000);

    } catch (error) {
        // addLog(`ERROR: ${error.message}`, 'error');
        alert(`Error al procesar: ${error.message}\n\nIntenta de nuevo o usa la búsqueda manual.`);
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
