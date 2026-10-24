// Номер WhatsApp, куда уходят заявки с формы (только цифры, без +)
const WHATSAPP_NUMBER = '70000000000';

// Фильтр квартир
const chips = document.querySelectorAll('.chip');
const cards = document.querySelectorAll('.card');

chips.forEach((chip) => {
  chip.addEventListener('click', () => {
    const filter = chip.dataset.filter;
    chips.forEach((c) => c.classList.toggle('is-active', c === chip));
    cards.forEach((card) => {
      const tags = card.dataset.tags.split(' ');
      card.hidden = filter !== 'all' && !tags.includes(filter);
    });
  });
});

// Форма бронирования: проверка дат и заявка в WhatsApp
const form = document.getElementById('booking');
const checkin = form.elements.checkin;
const checkout = form.elements.checkout;
const errorBox = form.querySelector('.booking__error');

const today = new Date().toISOString().slice(0, 10);
checkin.min = today;
checkout.min = today;

checkin.addEventListener('change', () => {
  checkout.min = checkin.value || today;
  hideError();
});
checkout.addEventListener('change', hideError);

function showError(text) {
  errorBox.textContent = text;
  errorBox.hidden = false;
}

function hideError() {
  errorBox.hidden = true;
}

function formatDate(value) {
  const [y, m, d] = value.split('-');
  return `${d}.${m}.${y}`;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();

  if (!checkin.value || !checkout.value) {
    showError('Выберите даты заезда и выезда');
    return;
  }
  if (checkout.value <= checkin.value) {
    showError('Дата выезда должна быть позже даты заезда');
    return;
  }

  const guests = form.elements.guests.value;
  const message =
    `Здравствуйте! Хочу узнать свободные квартиры и цены.\n` +
    `Заезд: ${formatDate(checkin.value)}\n` +
    `Выезд: ${formatDate(checkout.value)}\n` +
    `Гости: ${guests}`;

  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
});
