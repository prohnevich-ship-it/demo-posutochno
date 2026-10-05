/* Десять парадных — демонстрационный сайт.
   Скрипт считает стоимость проживания и показывает, где на рабочем сайте
   откроется модуль бронирования. Данные гостей никуда не отправляются. */

(function () {
  "use strict";

  var DAY = 24 * 60 * 60 * 1000;
  var money = new Intl.NumberFormat("ru-RU");
  var dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });

  function rub(value) {
    return money.format(value) + " ₽";
  }

  function plural(n, one, few, many) {
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  function nightsWord(n) {
    return n + " " + plural(n, "ночь", "ночи", "ночей");
  }

  function guestsWord(n) {
    return n + " " + plural(n, "гость", "гостя", "гостей");
  }

  function guestsGenitive(n) {
    return n + " " + (n === 1 ? "гостя" : "гостей");
  }

  function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
    var parts = value.split("-");
    var date = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
    return isNaN(date) ? null : date;
  }

  function isoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function todayUtc() {
    var now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }

  /* Ночь с пятницы на субботу и с субботы на воскресенье считается по выходной цене. */
  function countNights(checkIn, checkOut) {
    var weekday = 0;
    var weekend = 0;
    for (var t = checkIn.getTime(); t < checkOut.getTime(); t += DAY) {
      var day = new Date(t).getUTCDay();
      if (day === 5 || day === 6) weekend += 1;
      else weekday += 1;
    }
    return { weekday: weekday, weekend: weekend, total: weekday + weekend };
  }

  function readStay(form) {
    var checkIn = parseDate(form.elements.in.value);
    var checkOut = parseDate(form.elements.out.value);
    var guests = parseInt(form.elements.g.value, 10) || 1;
    if (!checkIn || !checkOut) {
      return { error: "Выберите даты заезда и выезда." };
    }
    if (checkIn < todayUtc()) {
      return { error: "Дата заезда уже прошла. Выберите сегодняшний день или позже." };
    }
    if (checkOut <= checkIn) {
      return { error: "Дата выезда должна быть позже даты заезда." };
    }
    var nights = countNights(checkIn, checkOut);
    if (nights.total > 30) {
      return { error: "На сайте можно забронировать до 30 ночей. Для долгого проживания напишите нам." };
    }
    return { checkIn: checkIn, checkOut: checkOut, guests: guests, nights: nights };
  }

  function stayQuery(stay) {
    return "?in=" + isoDate(stay.checkIn) + "&out=" + isoDate(stay.checkOut) + "&g=" + stay.guests;
  }

  function prepareDates(form) {
    var inField = form.elements.in;
    var outField = form.elements.out;
    var today = isoDate(todayUtc());
    inField.min = today;
    outField.min = today;
    inField.addEventListener("change", function () {
      var checkIn = parseDate(inField.value);
      if (!checkIn) return;
      var next = isoDate(new Date(checkIn.getTime() + DAY));
      outField.min = next;
      if (!outField.value || outField.value < next) outField.value = next;
    });
  }

  function fillFromUrl(form) {
    var params = new URLSearchParams(window.location.search);
    var checkIn = parseDate(params.get("in"));
    var checkOut = parseDate(params.get("out"));
    var guests = parseInt(params.get("g"), 10);
    if (checkIn && checkOut) {
      form.elements.in.value = isoDate(checkIn);
      form.elements.out.value = isoDate(checkOut);
    }
    if (guests) {
      var option = form.elements.g.querySelector('option[value="' + guests + '"]');
      if (option) form.elements.g.value = String(guests);
    }
    return Boolean(checkIn && checkOut);
  }

  /* ---------- Главная: подбор квартир ---------- */

  var search = document.querySelector("[data-search]");
  if (search) {
    var cards = Array.prototype.slice.call(document.querySelectorAll("[data-card]"));
    var pins = Array.prototype.slice.call(document.querySelectorAll("[data-pin]"));
    var searchError = search.querySelector("[data-error]");
    var result = document.querySelector("[data-result]");
    var resultText = document.querySelector("[data-result-text]");
    var defaultNote = document.querySelector("[data-default-note]");
    var empty = document.querySelector("[data-empty]");
    var reset = document.querySelector("[data-reset]");

    prepareDates(search);

    var pinFor = function (n) {
      return document.querySelector('[data-pin="' + n + '"]');
    };

    var showAll = function () {
      cards.forEach(function (card) {
        card.hidden = false;
        var link = card.querySelector("h3 a");
        link.href = link.getAttribute("data-href");
        card.querySelector("[data-plan-link]").href = link.getAttribute("data-href");
        card.querySelector("[data-price-main]").textContent = "от " + rub(+card.dataset.price);
        card.querySelector("[data-price-note]").textContent = "за ночь";
      });
      pins.forEach(function (pin) {
        pin.classList.remove("is-dim");
        pin.setAttribute("href", pin.getAttribute("data-href"));
      });
      result.hidden = true;
      defaultNote.hidden = false;
      empty.hidden = true;
    };

    var applySearch = function () {
      var stay = readStay(search);
      if (stay.error) {
        searchError.textContent = stay.error;
        return false;
      }
      searchError.textContent = "";
      var query = stayQuery(stay);
      var shown = 0;
      cards.forEach(function (card) {
        var fits = +card.dataset.guests >= stay.guests && +card.dataset.min <= stay.nights.total;
        var pin = pinFor(card.dataset.card);
        card.hidden = !fits;
        if (pin) pin.classList.toggle("is-dim", !fits);
        if (!fits) return;
        shown += 1;
        var total = stay.nights.weekday * +card.dataset.price + stay.nights.weekend * +card.dataset.weekend;
        var link = card.querySelector("h3 a");
        var href = link.getAttribute("data-href") + query;
        link.href = href;
        card.querySelector("[data-plan-link]").href = href;
        if (pin) pin.setAttribute("href", href);
        card.querySelector("[data-price-main]").textContent = rub(total);
        card.querySelector("[data-price-note]").textContent = "за " + nightsWord(stay.nights.total);
      });
      resultText.innerHTML =
        "<strong>" + shown + " " + plural(shown, "квартира", "квартиры", "квартир") + "</strong> " +
        "с " + dayMonth.format(stay.checkIn) + " по " + dayMonth.format(stay.checkOut) +
        ", " + nightsWord(stay.nights.total) + ", для " + guestsGenitive(stay.guests);
      result.hidden = false;
      defaultNote.hidden = true;
      empty.hidden = shown !== 0;
      return true;
    };

    search.addEventListener("submit", function (event) {
      event.preventDefault();
      if (applySearch()) {
        document.getElementById("kvartiry").scrollIntoView();
      }
    });

    reset.addEventListener("click", function () {
      search.reset();
      searchError.textContent = "";
      showAll();
    });

    cards.forEach(function (card) {
      var pin = pinFor(card.dataset.card);
      if (!pin) return;
      var on = function () {
        pin.classList.add("is-active");
        card.classList.add("is-active");
      };
      var off = function () {
        pin.classList.remove("is-active");
        card.classList.remove("is-active");
      };
      card.addEventListener("mouseenter", on);
      card.addEventListener("mouseleave", off);
      card.addEventListener("focusin", on);
      card.addEventListener("focusout", off);
      pin.addEventListener("mouseenter", on);
      pin.addEventListener("mouseleave", off);
      pin.addEventListener("focus", on);
      pin.addEventListener("blur", off);
    });
  }

  /* ---------- Страница квартиры: расчёт и демо-бронь ---------- */

  var booking = document.querySelector("[data-booking]");
  if (booking) {
    var price = +booking.dataset.price;
    var weekendPrice = +booking.dataset.weekend;
    var minNights = +booking.dataset.min;
    var deposit = +booking.dataset.deposit;
    var flatName = booking.dataset.name;
    var bookingError = booking.querySelector("[data-error]");
    var totalBox = document.querySelector("[data-total]");
    var dialog = document.querySelector("[data-dialog]");
    var dialogSummary = document.querySelector("[data-dialog-summary]");
    var lastStay = null;

    prepareDates(booking);

    var calculate = function (showErrors) {
      var stay = readStay(booking);
      if (!stay.error && stay.nights.total < minNights) {
        stay = { error: "Эта квартира сдаётся от " + nightsWord(minNights).replace("ночи", "ночей") + ". Выберите более поздний выезд." };
      }
      if (stay.error) {
        lastStay = null;
        totalBox.hidden = true;
        bookingError.textContent = showErrors ? stay.error : "";
        return null;
      }
      bookingError.textContent = "";
      var rows = [];
      if (stay.nights.weekday) {
        rows.push([nightsWord(stay.nights.weekday) + " в будни × " + rub(price), rub(stay.nights.weekday * price)]);
      }
      if (stay.nights.weekend) {
        rows.push([nightsWord(stay.nights.weekend) + " в выходные × " + rub(weekendPrice), rub(stay.nights.weekend * weekendPrice)]);
      }
      stay.total = stay.nights.weekday * price + stay.nights.weekend * weekendPrice;
      var html = rows.map(function (row) {
        return "<div><span>" + row[0] + "</span><span>" + row[1] + "</span></div>";
      }).join("");
      html += '<div class="sum"><span>Итого за ' + nightsWord(stay.nights.total) + "</span><span>" + rub(stay.total) + "</span></div>";
      html += "<div><span>Залог, вернём после выезда</span><span>" + rub(deposit) + "</span></div>";
      totalBox.innerHTML = html;
      totalBox.hidden = false;
      lastStay = stay;
      return stay;
    };

    if (fillFromUrl(booking)) calculate(true);

    ["in", "out", "g"].forEach(function (name) {
      booking.elements[name].addEventListener("change", function () {
        calculate(Boolean(booking.elements.in.value && booking.elements.out.value));
      });
    });

    booking.addEventListener("submit", function (event) {
      event.preventDefault();
      var stay = calculate(true);
      if (!stay) return;
      dialogSummary.textContent =
        flatName + ", с " + dayMonth.format(stay.checkIn) + " по " + dayMonth.format(stay.checkOut) +
        ", " + guestsWord(stay.guests) + ", " + rub(stay.total) + ".";
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    });
  }
})();
