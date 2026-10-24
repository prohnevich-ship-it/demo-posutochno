/* Десять парадных — показательный помощник в чате.

   Это демонстрация идеи, а не нейросеть: помощник разбирает сообщение гостя
   по правилам и отвечает только по данным из assets/flats.json.
   Занятость квартир условная и считается прямо в браузере.
   Сообщения никуда не отправляются. На рабочем сайте на месте функции reply()
   стоит запрос к серверу, который обращается к нейросети и к календарю броней. */

(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var ROOT = script.getAttribute("data-root") || "";
  var DATA_URL = ROOT + script.getAttribute("data-data");
  var PAGE_FLAT = script.getAttribute("data-flat") || "";
  var STORE_KEY = "demo-chat-v1";
  var DAY = 24 * 60 * 60 * 1000;
  var NB = " ";

  var money = new Intl.NumberFormat("ru-RU");
  var dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });

  var site = null;
  var flats = [];
  var state = { open: false, log: [], ctx: {} };

  /* ---------- Мелкие помощники ---------- */

  function rub(value) {
    return money.format(value) + NB + "₽";
  }

  function plural(n, one, few, many) {
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  function nightsWord(n) {
    return n + NB + plural(n, "ночь", "ночи", "ночей");
  }

  function guestsFor(n) {
    return "для" + NB + n + NB + (n === 1 ? "гостя" : "гостей");
  }

  function minutes(n) {
    return n + NB + plural(n, "минута", "минуты", "минут");
  }

  function todayUtc() {
    var now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }

  function iso(date) {
    return date.toISOString().slice(0, 10);
  }

  function fromIso(value) {
    var p = value.split("-");
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  }

  function addDays(date, n) {
    return new Date(date.getTime() + n * DAY);
  }

  function period(stay) {
    var sameMonth = stay.checkIn.getUTCMonth() === stay.checkOut.getUTCMonth() &&
      stay.checkIn.getUTCFullYear() === stay.checkOut.getUTCFullYear();
    var from = sameMonth ? String(stay.checkIn.getUTCDate()) : dayMonth.format(stay.checkIn);
    return "с" + NB + from + " по" + NB + dayMonth.format(stay.checkOut);
  }

  function flatBySlug(slug) {
    for (var i = 0; i < flats.length; i += 1) if (flats[i].slug === slug) return flats[i];
    return null;
  }

  function has(flat, stem) {
    return flat.amenities.some(function (a) {
      return a.toLowerCase().indexOf(stem) !== -1;
    });
  }

  function find(flat, stem) {
    for (var i = 0; i < flat.amenities.length; i += 1) {
      if (flat.amenities[i].toLowerCase().indexOf(stem) !== -1) return flat.amenities[i];
    }
    return "";
  }

  function hasLift(flat) {
    return /лифт/i.test(flat.floor) && !/без лифта/i.test(flat.floor);
  }

  /* ---------- Цена и условная занятость ---------- */

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

  function total(flat, stay) {
    var n = countNights(stay.checkIn, stay.checkOut);
    return n.weekday * flat.price + n.weekend * flat.weekend;
  }

  /* Занятость в демо придумана: квартира «занята» блоками по пять дней.
     Расчёт зависит только от номера квартиры и даты, поэтому ответы не скачут. */
  function busyOn(flat, date) {
    var dayNumber = Math.floor(date.getTime() / DAY);
    var block = Math.floor((dayNumber + flat.n * 3) / 5);
    var hash = (Math.imul(flat.n * 7919 + 13, 2654435761) ^ Math.imul(block, 40503)) >>> 0;
    return hash % 100 < 20;
  }

  function isFree(flat, stay) {
    for (var t = stay.checkIn.getTime(); t < stay.checkOut.getTime(); t += DAY) {
      if (busyOn(flat, new Date(t))) return false;
    }
    return true;
  }

  /* ---------- Разбор сообщения гостя ---------- */

  var MONTH = "(?:январ[яь]|феврал[яь]|марта?|апрел[яь]|ма[яй]|июн[яь]|июл[яь]|августа?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])";
  var MONTH_INDEX = [
    ["янв", 0], ["фев", 1], ["мар", 2], ["апр", 3], ["ма", 4], ["июн", 5],
    ["июл", 6], ["авг", 7], ["сен", 8], ["окт", 9], ["ноя", 10], ["дек", 11]
  ];
  var NIGHT_WORDS = { "одну": 1, "две": 2, "три": 3, "четыре": 4, "пять": 5, "шесть": 6, "семь": 7 };

  /* Граница слова для кириллицы: обычное \b в JavaScript с русскими буквами не работает. */
  function word(pattern) {
    return new RegExp("(?:^|[^а-яa-z0-9])(?:" + pattern + ")(?![а-яa-z0-9])");
  }

  function monthIndex(text) {
    for (var i = 0; i < MONTH_INDEX.length; i += 1) {
      if (text.indexOf(MONTH_INDEX[i][0]) === 0) return MONTH_INDEX[i][1];
    }
    return -1;
  }

  function nearest(day, month) {
    var today = todayUtc();
    var date = new Date(Date.UTC(today.getUTCFullYear(), month, day));
    if (date.getUTCMonth() !== month) return null;
    if (date < today) date = new Date(Date.UTC(today.getUTCFullYear() + 1, month, day));
    return date;
  }

  function parseNights(text) {
    if (/на\s*недел/.test(text)) return 7;
    var m = text.match(/(\d{1,2}|одну|две|три|четыре|пять|шесть|семь)\s*(?:ноч|сут|дн)/);
    if (m) return NIGHT_WORDS[m[1]] || parseInt(m[1], 10);
    if (/на\s*(?:ноч|сутки)/.test(text)) return 1;
    return 0;
  }

  function parseDates(text) {
    var today = todayUtc();
    var m;
    var checkIn = null;
    var checkOut = null;

    m = text.match(new RegExp("(\\d{1,2})\\s*(" + MONTH + ")?\\s*(?:по|до|-|–|—)\\s*(\\d{1,2})\\s*(" + MONTH + ")"));
    if (m) {
      var outMonth = monthIndex(m[4]);
      var inMonth = m[2] ? monthIndex(m[2]) : outMonth;
      checkIn = nearest(+m[1], inMonth);
      if (checkIn) {
        checkOut = new Date(Date.UTC(checkIn.getUTCFullYear(), outMonth, +m[3]));
        if (checkOut <= checkIn) checkOut = new Date(Date.UTC(checkIn.getUTCFullYear() + 1, outMonth, +m[3]));
      }
    }
    if (!checkIn) {
      m = text.match(/(\d{1,2})\.(\d{1,2})(?:\.\d{2,4})?\s*(?:по|до|-|–|—)\s*(\d{1,2})\.(\d{1,2})/);
      if (m) {
        checkIn = nearest(+m[1], +m[2] - 1);
        if (checkIn) {
          checkOut = new Date(Date.UTC(checkIn.getUTCFullYear(), +m[4] - 1, +m[3]));
          if (checkOut <= checkIn) checkOut = new Date(Date.UTC(checkIn.getUTCFullYear() + 1, +m[4] - 1, +m[3]));
        }
      }
    }
    if (!checkIn && /выходн/.test(text)) {
      var shift = (5 - today.getUTCDay() + 7) % 7;
      if (/следующ/.test(text)) shift += 7;
      checkIn = addDays(today, shift);
      checkOut = addDays(checkIn, 2);
    }
    if (!checkIn) {
      m = text.match(new RegExp("(\\d{1,2})\\s*(" + MONTH + ")"));
      if (m) checkIn = nearest(+m[1], monthIndex(m[2]));
    }
    if (!checkIn) {
      m = text.match(/(?:^|[^\d.])(\d{1,2})\.(\d{1,2})(?![\d.])/);
      if (m && +m[2] >= 1 && +m[2] <= 12) checkIn = nearest(+m[1], +m[2] - 1);
    }
    if (!checkIn && /послезавтра/.test(text)) checkIn = addDays(today, 2);
    if (!checkIn && /завтра/.test(text)) checkIn = addDays(today, 1);
    if (!checkIn && /сегодня/.test(text)) checkIn = today;

    return { checkIn: checkIn, checkOut: checkOut };
  }

  var GUEST_WORDS = [
    [word("один|одного|одна|одной|одному"), 1],
    [/вдвоем|двоих|двое|для пары|парой|вдвоём/, 2],
    [/втроем|троих|трое/, 3],
    [/вчетвером|четверых|четверо/, 4],
    [/впятером|пятерых|пятеро/, 5],
    [/вшестером|шестерых|шестеро/, 6]
  ];

  function parseGuests(text) {
    var base = 0;
    var m = text.match(/(\d{1,2})\s*(?:-?х\s*)?(?:гост|человек|чел(?![а-я])|взросл|персон)/);
    if (m) base = parseInt(m[1], 10);
    if (!base) {
      m = text.match(/нас\s*(\d{1,2})(?!\s*(?:ноч|сут|дн))/);
      if (m) base = parseInt(m[1], 10);
    }
    if (!base) {
      for (var i = 0; i < GUEST_WORDS.length; i += 1) {
        if (GUEST_WORDS[i][0].test(text)) {
          base = GUEST_WORDS[i][1];
          break;
        }
      }
    }
    var kids = 0;
    if (/двумя детьми|двое детей|2 детьми|2 детей/.test(text)) kids = 2;
    else if (/с ребенком|и ребенок|\+\s*ребенок|с малышом/.test(text)) kids = 1;
    if (kids) return (base || 2) + kids;
    return base;
  }

  function parseBudget(text) {
    var re = /(?:до|не дороже|в пределах)\s*(\d[\d\s]*)\s*(тыс|к(?![а-я]))?/g;
    var m;
    while ((m = re.exec(text))) {
      var value = parseInt(m[1].replace(/\s/g, ""), 10);
      if (m[2]) value *= 1000;
      if (value >= 1000) return value;
    }
    return 0;
  }

  var FEATURES = [
    { key: "lift", re: /лифт/, label: "с лифтом", test: hasLift },
    { key: "aircon", re: /кондиционер/, label: "с кондиционером", test: function (f) { return has(f, "кондиционер"); } },
    { key: "desk", re: /рабоч\S* (?:стол|мест)|для работы|удаленк/, label: "с рабочим столом", test: function (f) { return has(f, "рабочий стол"); } },
    { key: "dish", re: /посудомо/, label: "с посудомоечной машиной", test: function (f) { return has(f, "посудомоечн"); } },
    { key: "view", re: /с видом|вид на|у воды/, label: "с видом на воду", test: function (f) { return has(f, "вид на"); } },
    { key: "crib", re: /кроватк/, label: "с детской кроваткой", test: function (f) { return has(f, "детская кроватка"); } },
    { key: "pets", re: /животн|собак|кошк|питом/, label: "куда можно с животными", test: function (f) { return f.pets; } },
    { key: "pets", re: word("кот|кота|котом|коту"), label: "куда можно с животными", test: function (f) { return f.pets; } }
  ];

  var AREAS = [
    { key: "vo", re: /васильевск|васьк/, label: "на Васильевском острове", test: function (f) { return f.district === "Васильевский остров"; } },
    { key: "ps", re: /петроградк|петроградск/, label: "на Петроградской стороне", test: function (f) { return f.district === "Петроградская сторона"; } },
    { key: "metro", re: /(?:у|возле|около|близко к|рядом с)\s*метро/, label: "не дальше 6 минут от метро", test: function (f) { return f.metro_min <= 6; } },
    { key: "hermitage", re: /эрмитаж|дворцов/, label: "рядом с Эрмитажем", test: function (f) { return f.n === 2; } },
    { key: "center", re: /в центре|центр города|в самом центре|исторический центр/, label: "в центре", test: function (f) { return f.district === "Центральный район" || f.district === "Адмиралтейский район"; } }
  ];

  function parseType(text) {
    if (/студи/.test(text)) return "Студия";
    if (/(?:две|2|двумя)\s*спальн|трехкомнат|3-?комнат/.test(text)) return "2 спальни";
    if (/одн\S* спальн|1 спальн|двухкомнат|2-?комнат|отдельн\S* спальн/.test(text)) return "1 спальня";
    return "";
  }

  function namedFlat(text) {
    var m = text.match(/(?:квартир\S*|номер|№)\s*(?:номер\s*|№\s*)?(\d{1,2})(?!\d)(?!\s*(?:ноч|сут|дн|гост|человек|чел|спальн|комнат))/);
    if (m) {
      for (var i = 0; i < flats.length; i += 1) if (flats[i].n === +m[1]) return flats[i];
    }
    for (var j = 0; j < flats.length; j += 1) {
      var keys = flats[j].keywords || [];
      for (var k = 0; k < keys.length; k += 1) if (text.indexOf(keys[k]) !== -1) return flats[j];
    }
    return null;
  }

  var TOPICS = [
    ["parking", /парков|паркинг|машин\S* (?:остав|постав)|припарк/],
    ["lift", /лифт|этаж/],
    ["beds", /кроват|спальн\S* мест|диван|сколько спален|где спать|раскладушк/],
    ["wifi", /wi-?fi|вай-?фай|интернет/],
    ["kitchen", /кухн|плит|посуд|духовк|готовить|холодильник|микроволнов/],
    ["washing", /стиральн|стирк|постира|сушильн/],
    ["aircon", /кондиционер/],
    ["view", /вид из|какой вид|окна выход|вид на/],
    ["metro", /метро/],
    ["nearby", /рядом|поблизости|недалеко|вокруг|достопримеч|куда сходить/],
    ["area", /площад|метраж|сколько метров|квадрат/],
    ["price", /сколько стоит|цен[аыу]|стоимост|почем|тариф|сколько будет стоить/],
    ["pets", /животн|собак|кошк|питом/],
    ["pets", word("кот|кота|котом|коту")],
    ["kids", /дет(?:ь|ей|ям|ск)|ребен|кроватк|малыш/],
    ["address", /адрес|где находит|какой дом|на какой улице/]
  ];

  var GENERAL = [
    ["checkin", /заезд|заселен|выезд|во сколько|ночью|поздно|ключ|код от/],
    ["deposit", /залог|депозит/],
    ["cancel", /отмен|вернуть деньги|возврат/],
    ["docs", /документ|командиров|отчетн|паспорт/],
    ["docs", word("чек|чека|чеки|счет|счета|акт|акта|акты")],
    ["pay", /оплат|предоплат|картой|наличн/],
    ["clean", /уборк|бель|полотен/],
    ["rules", /курить|курен|шум|вечерин|праздник/]
  ];

  var SEARCH_WORDS = /подбер|подобр|ищу|ищем|нужн\S* (?:квартир|жиль|студи|апартамент)|свободн|вариант|снять|посовет|что есть|покаж|найди|найти|квартир\S* с\s/;
  var LIST_WORDS = /куда можно|в каких|какие квартир|где есть|в какой квартир/;
  var ABOUT_THIS = word("свободна|свободно|занята|занято|эта|эту|этой|этом|здесь|тут|она|ее");

  function firstTopic(list, text) {
    for (var i = 0; i < list.length; i += 1) if (list[i][1].test(text)) return list[i][0];
    return "";
  }

  function parse(raw) {
    var text = raw.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
    var dates = parseDates(text);
    var slots = {
      text: text,
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
      nights: parseNights(text),
      guests: parseGuests(text),
      budget: parseBudget(text),
      type: parseType(text),
      cheap: /подешевле|дешев|недорог|бюджет|эконом/.test(text),
      features: FEATURES.filter(function (f, i) {
        return f.re.test(text) && !FEATURES.slice(0, i).some(function (g) { return g.key === f.key && g.re.test(text); });
      }),
      areas: AREAS.filter(function (a) { return a.re.test(text); }),
      flat: namedFlat(text),
      topic: firstTopic(TOPICS, text),
      general: firstTopic(GENERAL, text),
      wantsSearch: SEARCH_WORDS.test(text),
      listMode: LIST_WORDS.test(text),
      bare: /^\d{1,2}$/.test(text) ? parseInt(text, 10) : 0
    };
    return slots;
  }

  /* ---------- Ответы ---------- */

  function flatCard(flat, stay, guests) {
    var line = flat.type + ", " + flat.area + NB + "м², до" + NB + flat.guests + NB + (flat.guests === 1 ? "гостя" : "гостей") +
      ", " + minutes(flat.metro_min) + " до метро";
    var price = stay
      ? rub(total(flat, stay)) + " за" + NB + nightsWord(countNights(stay.checkIn, stay.checkOut).total)
      : "от" + NB + rub(flat.price) + " за ночь";
    var query = stay ? "?in=" + iso(stay.checkIn) + "&out=" + iso(stay.checkOut) + "&g=" + Math.min(guests || 2, flat.guests) : "";
    return { slug: flat.slug, name: flat.name, line: line, price: price, query: query };
  }

  function currentStay() {
    var c = state.ctx;
    if (c.checkIn && c.checkOut) return { checkIn: fromIso(c.checkIn), checkOut: fromIso(c.checkOut) };
    return null;
  }

  function handoff() {
    return {
      text: "Этого нет в моих данных, поэтому отвечать наугад не буду.\nНа рабочем сайте такой вопрос уходит администратору, и гость получает ответ в этом же окне.",
      chips: ["Подобрать квартиру", "Как проходит заселение?"]
    };
  }

  function searchReply() {
    var c = state.ctx;
    var stay = currentStay();
    var guests = c.guests || 0;
    var filters = (c.features || []).map(function (key) {
      return FEATURES.filter(function (f) { return f.key === key; })[0];
    }).concat((c.areas || []).map(function (key) {
      return AREAS.filter(function (a) { return a.key === key; })[0];
    }));

    var fits = flats.filter(function (f) {
      if (c.exclude && f.slug === c.exclude) return false;
      if (guests && f.guests < guests) return false;
      if (c.type && f.type !== c.type) return false;
      for (var i = 0; i < filters.length; i += 1) if (!filters[i].test(f)) return false;
      if (c.budget) {
        var perNight = stay ? total(f, stay) / countNights(stay.checkIn, stay.checkOut).total : f.price;
        if (perNight > c.budget) return false;
      }
      return true;
    });

    var wishes = [];
    if (guests) wishes.push(guestsFor(guests));
    if (c.type) wishes.push({ "Студия": "студия", "1 спальня": "с одной спальней", "2 спальни": "с двумя спальнями" }[c.type]);
    filters.forEach(function (f) { wishes.push(f.label); });
    if (c.budget) wishes.push("до" + NB + rub(c.budget) + " за ночь");
    var wishText = wishes.length ? " (" + wishes.join(", ") + ")" : "";

    if (!fits.length) {
      var biggest = flats.reduce(function (a, b) { return b.guests > a.guests ? b : a; });
      var hint = guests > biggest.guests
        ? "Самая большая квартира вмещает " + biggest.guests + NB + "гостей. Большой компании подойдут две квартиры: на рабочем сайте такой запрос уходит администратору."
        : "Попробуйте убрать одно из пожеланий или поднять бюджет.";
      return { text: "Под такой запрос" + wishText + " ничего не нашлось.\n" + hint, chips: ["Начать заново"] };
    }

    var nights = stay ? countNights(stay.checkIn, stay.checkOut).total : 0;
    var tooShort = stay ? fits.filter(function (f) { return f.min_nights > nights; }) : [];
    var bookable = stay ? fits.filter(function (f) { return f.min_nights <= nights; }) : fits;
    var free = stay ? bookable.filter(function (f) { return isFree(f, stay); }) : bookable;
    var busyCount = bookable.length - free.length;

    free.sort(function (a, b) {
      if (!c.cheap && guests && a.guests !== b.guests) return a.guests - b.guests;
      return a.price - b.price;
    });

    if (stay && !free.length) {
      var lines = ["На даты " + period(stay) + " всё подходящее" + wishText + " занято."];
      if (tooShort.length) lines.push("Ещё " + tooShort.length + NB + plural(tooShort.length, "квартира сдаётся", "квартиры сдаются", "квартир сдаются") + " от двух ночей.");
      lines.push("Назовите другие даты, и я проверю снова.");
      return { text: lines.join("\n"), chips: ["На следующие выходные", "Начать заново"] };
    }

    var shown = free.slice(0, 3);
    c.lastFlat = shown[0].slug;
    var head;
    if (stay) {
      head = free.length + NB + plural(free.length, "квартира свободна", "квартиры свободны", "квартир свободно") + " " + period(stay) + wishText + ".";
      if (free.length > shown.length) head += " Показываю три самые подходящие.";
      if (busyCount) head += "\nЕщё " + busyCount + NB + plural(busyCount, "подходящая занята", "подходящие заняты", "подходящих занято") + " на эти даты.";
    } else {
      head = fits.length + NB + plural(fits.length, "квартира подходит", "квартиры подходят", "квартир подходит") + wishText + ".";
      if (free.length > shown.length) head += " Показываю три самые подходящие.";
    }

    var ask = "";
    var chips = [];
    if (!stay) {
      ask = "\nНазовите даты заезда и выезда: проверю, что свободно, и посчитаю цену за весь срок.";
      c.awaiting = "dates";
      chips = ["На эти выходные", "На следующие выходные"];
    } else if (!guests) {
      ask = "\nСколько вас будет? Уточню подбор.";
      c.awaiting = "guests";
      chips = ["Двое", "Трое", "Четверо"];
    } else {
      c.awaiting = "";
      chips = ["Есть ли лифт?", "Что рядом?", "Начать заново"];
    }

    return {
      text: head + ask,
      flats: shown.map(function (f) { return flatCard(f, stay, guests); }),
      chips: chips
    };
  }

  function quoteReply(flat) {
    var c = state.ctx;
    var stay = currentStay();
    var guests = c.guests || 0;
    c.lastFlat = flat.slug;
    if (guests > flat.guests) {
      return {
        text: "«" + flat.name + "» вмещает до" + NB + flat.guests + NB + "гостей, а вас " + guests + ". Подобрать квартиру побольше?",
        chips: ["Подобрать квартиру"]
      };
    }
    var nights = countNights(stay.checkIn, stay.checkOut).total;
    if (flat.min_nights > nights) {
      return { text: "«" + flat.name + "» сдаётся от" + NB + flat.min_nights + NB + "ночей. Добавьте ночь, и я посчитаю цену.", chips: ["Подобрать другую квартиру"] };
    }
    if (!isFree(flat, stay)) {
      return {
        text: "«" + flat.name + "» " + period(stay) + " занята.\nМогу подобрать похожую на эти же даты.",
        chips: ["Подобрать другую квартиру"]
      };
    }
    return {
      text: "«" + flat.name + "» " + period(stay) + " свободна.\nЗалог " + rub(site.deposit) + " возвращается после выезда. Бронь оформляется на странице квартиры.",
      flats: [flatCard(flat, stay, guests)],
      chips: ["Есть ли лифт?", "Что рядом?"]
    };
  }

  function listReply(title, test, emptyText) {
    var list = flats.filter(test);
    if (!list.length) return { text: emptyText };
    var stay = currentStay();
    return {
      text: title + " Назовите квартиру, если нужны подробности.",
      flats: list.slice(0, 4).map(function (f) { return flatCard(f, stay, state.ctx.guests); })
    };
  }

  function topicReply(topic, flat) {
    if (topic === "parking") {
      return {
        text: "Про парковку у меня данных нет, отвечать наугад не буду.\nНа рабочем сайте такой вопрос уходит администратору, и гость получает ответ в этом же окне.",
        chips: ["Подобрать квартиру"]
      };
    }
    if (!flat) {
      if (topic === "lift") return listReply("Лифт есть в этих квартирах.", hasLift, "Квартир с лифтом нет.");
      if (topic === "pets") return listReply("С небольшими животными можно в эти квартиры.", function (f) { return f.pets; }, "С животными заселиться нельзя.");
      if (topic === "aircon") return listReply("Кондиционер есть в этой квартире.", function (f) { return has(f, "кондиционер"); }, "Квартир с кондиционером нет.");
      if (topic === "view") return listReply("Вид на воду есть в этих квартирах.", function (f) { return has(f, "вид на"); }, "Квартир с видом на воду нет.");
      if (topic === "price") {
        var cheapest = flats.reduce(function (a, b) { return b.price < a.price ? b : a; });
        var dearest = flats.reduce(function (a, b) { return b.price > a.price ? b : a; });
        return {
          text: "Цены в будни от " + rub(cheapest.price) + " до " + rub(dearest.price) + " за ночь, в выходные дороже.\nНазовите даты и число гостей, и я посчитаю точную сумму.",
          chips: ["На двоих на выходные"]
        };
      }
      return { text: "О какой квартире рассказать? Напишите, например, «на Мойке» или «у Мариинского театра».", chips: ["Подобрать квартиру"] };
    }

    state.ctx.lastFlat = flat.slug;
    var name = "«" + flat.name + "»";
    var text = "";
    var stay = currentStay();
    if (topic === "lift") text = name + ": " + flat.floor.charAt(0).toLowerCase() + flat.floor.slice(1) + "." + (/лифт/i.test(flat.floor) ? "" : " Лифта нет.");
    else if (topic === "beds") text = name + ": " + flat.beds.charAt(0).toLowerCase() + flat.beds.slice(1) + ". Вмещает до" + NB + flat.guests + NB + "гостей.";
    else if (topic === "wifi") text = "В квартире " + name + " есть " + (find(flat, "wi-fi") || "Wi-Fi") + ".";
    else if (topic === "kitchen") text = name + ": " + (find(flat, "кух") || "кухня").toLowerCase() + "." + (has(flat, "посудомоечн") ? " Есть посудомоечная машина." : "");
    else if (topic === "washing") text = has(flat, "стиральн") ? "Да, в квартире " + name + " есть " + find(flat, "стиральн").toLowerCase() + "." : "Стиральной машины в квартире " + name + " нет.";
    else if (topic === "aircon") text = has(flat, "кондиционер") ? "Да, в квартире " + name + " есть кондиционер." : "Кондиционера в квартире " + name + " нет.";
    else if (topic === "view") text = has(flat, "вид на") ? name + ": " + find(flat, "вид на").toLowerCase() + "." : "Окна квартиры " + name + " выходят во двор или на улицу, вида на воду нет.";
    else if (topic === "metro") text = "От квартиры " + name + " до метро «" + flat.metro + "» " + minutes(flat.metro_min) + " пешком.";
    else if (topic === "nearby") {
      text = "Рядом с квартирой " + name + ":\n" + flat.nearby.map(function (p) { return p[0] + ", " + minutes(p[1]) + " пешком"; }).join("\n") +
        "\nМетро «" + flat.metro + "», " + minutes(flat.metro_min) + " пешком";
    } else if (topic === "area") text = name + ": " + flat.type.toLowerCase() + ", " + flat.area + NB + "м².";
    else if (topic === "price") {
      text = name + ": " + rub(flat.price) + " за ночь в будни, " + rub(flat.weekend) + " в выходные." +
        (flat.min_nights > 1 ? " Бронь от" + NB + flat.min_nights + NB + "ночей." : "");
      if (stay && countNights(stay.checkIn, stay.checkOut).total >= flat.min_nights) text += "\n" + period(stay).replace(/^с/, "С") + " выйдет " + rub(total(flat, stay)) + ".";
      else text += "\nНазовите даты, и я посчитаю сумму за весь срок.";
    } else if (topic === "pets") text = flat.pets ? "Да, в квартиру " + name + " можно с небольшой собакой или кошкой. Предупредите об этом при бронировании." : "В квартиру " + name + " с животными нельзя. Могу показать квартиры, куда можно.";
    else if (topic === "kids") {
      var kid = find(flat, "детск");
      text = kid ? "Да, в квартире " + name + " есть " + kid.toLowerCase() + "." : "Детской кроватки в квартире " + name + " в списке нет. На рабочем сайте такой вопрос уходит администратору.";
    } else if (topic === "address") text = name + ": " + flat.street + ", " + flat.district + ". Номер дома и код от двери приходят после бронирования.";

    var reply = { text: text };
    if (topic === "price") reply.flats = [flatCard(flat, stay, state.ctx.guests)];
    if (topic === "pets" && !flat.pets) reply.chips = ["Куда можно с животными?"];
    else reply.chips = ["Есть ли лифт?", "Что рядом?", "Сколько стоит?"].filter(function (chip) {
      return !(topic === "lift" && chip === "Есть ли лифт?") && !(topic === "nearby" && chip === "Что рядом?") && !(topic === "price" && chip === "Сколько стоит?");
    });
    return reply;
  }

  function generalReply(topic) {
    var t = "";
    if (topic === "checkin") t = "Заезд с " + site.checkin + ", выезд до " + site.checkout + ".\nДверь открывается кодом: он приходит в день заезда вместе с инструкцией, поэтому приехать можно и ночью.";
    else if (topic === "deposit") t = "Залог " + rub(site.deposit) + ". Он блокируется на карте при заезде и возвращается в течение суток после выезда.";
    else if (topic === "cancel") t = "Отмена бесплатная за трое суток до заезда и раньше: предоплата возвращается полностью.\nПри более поздней отмене предоплата за первую ночь не возвращается.";
    else if (topic === "docs") t = "При заселении нужен паспорт.\nДля командировок заключаем договор, выставляем счёт и отдаём чек и акт.";
    else if (topic === "pay") t = "Предоплата равна стоимости первой ночи и вносится картой на сайте. Остальное оплачивается при заезде.";
    else if (topic === "clean") t = "К заезду квартира убрана, постели застелены, на каждого гостя лежит комплект полотенец.\nПри проживании дольше семи ночей раз в неделю убираем и меняем бельё бесплатно.";
    else if (topic === "rules") t = "В квартирах нельзя курить, шуметь с 22:00 до 8:00 и проводить вечеринки.";
    return { text: t, chips: ["Подобрать квартиру"] };
  }

  function intro() {
    var flat = PAGE_FLAT ? flatBySlug(PAGE_FLAT) : null;
    if (flat) {
      return {
        text: "Здравствуйте! Отвечу на вопросы о квартире «" + flat.name + "» и проверю, свободна ли она на ваши даты.",
        chips: ["Свободна на эти выходные?", "Есть ли лифт?", "Что рядом?"]
      };
    }
    return {
      text: "Здравствуйте! Подберу свободную квартиру и отвечу на вопросы о ней.\nНапишите, сколько вас и на какие даты.",
      chips: ["На двоих на эти выходные", "Трое, с лифтом, у метро", "Как проходит заселение?"]
    };
  }

  function reply(raw) {
    var s = parse(raw);
    var c = state.ctx;

    if (/начать заново|сначала|сбрось/.test(s.text)) {
      state.ctx = {};
      var fresh = intro();
      fresh.text = fresh.text.replace("Здравствуйте! ", "Начинаем заново. ");
      return fresh;
    }

    /* Ответ одним числом на уточняющий вопрос */
    if (s.bare && c.awaiting === "guests") s.guests = s.bare;
    if (s.bare && c.awaiting === "nights") s.nights = s.bare;

    /* Даты: полный период, либо день заезда и число ночей */
    var pending = c.pendingIn ? fromIso(c.pendingIn) : null;
    if (s.checkIn && s.checkOut) {
      c.checkIn = iso(s.checkIn);
      c.checkOut = iso(s.checkOut);
      c.pendingIn = "";
    } else if (s.checkIn && s.nights) {
      c.checkIn = iso(s.checkIn);
      c.checkOut = iso(addDays(s.checkIn, s.nights));
      c.pendingIn = "";
    } else if (!s.checkIn && s.nights && pending) {
      c.checkIn = iso(pending);
      c.checkOut = iso(addDays(pending, s.nights));
      c.pendingIn = "";
    } else if (s.checkIn) {
      var askedFlat = s.flat || (PAGE_FLAT && ABOUT_THIS.test(s.text) ? flatBySlug(PAGE_FLAT) : null);
      c.pendingIn = iso(s.checkIn);
      c.pendingFlat = askedFlat ? askedFlat.slug : "";
      c.awaiting = "nights";
      if (s.guests) c.guests = s.guests;
      return { text: "Заезд " + dayMonth.format(s.checkIn) + ". На сколько ночей?", chips: ["На 2 ночи", "На 3 ночи", "На неделю"] };
    }
    var gotDates = Boolean((s.checkIn && (s.checkOut || s.nights)) || (!s.checkIn && s.nights && pending));

    var stay = currentStay();
    if (stay && countNights(stay.checkIn, stay.checkOut).total > 30) {
      c.checkIn = "";
      c.checkOut = "";
      return { text: "На сайте можно забронировать до 30 ночей. Для долгого проживания нужен администратор: на рабочем сайте я передам ему вопрос." };
    }

    var newSlots = Boolean(s.guests || gotDates || s.budget || s.type || s.cheap);
    var wantsOther = /друг(?:ую|ой|ие|их)|похож|еще вариант|побольше/.test(s.text);
    var hasWishes = Boolean(s.features.length || s.areas.length || s.type || s.budget || s.cheap);

    /* Новая просьба (другое число гостей или «ищу…») отменяет прежние пожелания,
       а ответ на уточняющий вопрос их сохраняет. */
    var fresh = (s.guests && c.awaiting !== "guests") || (s.wantsSearch && !wantsOther && (newSlots || hasWishes));
    if (fresh) {
      c.features = [];
      c.areas = [];
      c.type = "";
      c.budget = 0;
      c.cheap = false;
    }
    if (s.guests) c.guests = s.guests;
    if (s.budget) c.budget = s.budget;
    if (s.type) c.type = s.type;
    if (s.cheap) c.cheap = true;

    var pageFlat = PAGE_FLAT ? flatBySlug(PAGE_FLAT) : null;
    var aboutThis = ABOUT_THIS.test(s.text);

    /* Вопрос про конкретную квартиру на конкретные даты */
    if (stay && !wantsOther) {
      if (gotDates && c.pendingFlat && !s.flat) {
        var asked = flatBySlug(c.pendingFlat);
        c.pendingFlat = "";
        if (asked) return quoteReply(asked);
      }
      if (s.flat && (gotDates || aboutThis)) return quoteReply(s.flat);
      if (pageFlat && !s.flat && gotDates && aboutThis && !hasWishes) return quoteReply(pageFlat);
    }

    /* Подбор */
    var searching = newSlots || s.wantsSearch || wantsOther || (!s.topic && (s.features.length || s.areas.length));
    if (searching && !s.flat) {
      var current = pageFlat || (c.lastFlat ? flatBySlug(c.lastFlat) : null);
      c.exclude = wantsOther && current ? current.slug : "";
      /* Пожелания запоминаем только из просьб о подборе, а не из вопросов о квартире. */
      s.features.forEach(function (f) {
        c.features = c.features || [];
        if (c.features.indexOf(f.key) === -1) c.features.push(f.key);
      });
      s.areas.forEach(function (a) {
        c.areas = c.areas || [];
        if (c.areas.indexOf(a.key) === -1) c.areas.push(a.key);
      });

      if (s.wantsSearch && !newSlots && !hasWishes && !c.guests && !stay) {
        return { text: "Подберу. Сколько вас будет и на какие даты?", chips: ["На двоих на эти выходные", "Трое, с лифтом, у метро"] };
      }
      return searchReply();
    }

    /* Вопросы о квартире и общие правила */
    if (s.topic) {
      var flat = s.flat || (s.listMode ? null : pageFlat || (c.lastFlat ? flatBySlug(c.lastFlat) : null));
      return topicReply(s.topic, flat);
    }
    if (s.flat) {
      c.lastFlat = s.flat.slug;
      return {
        text: "«" + s.flat.name + "». " + s.flat.lead + "\nСпросите про этаж, спальные места, метро или цену на ваши даты.",
        flats: [flatCard(s.flat, stay, c.guests)],
        chips: ["Есть ли лифт?", "Что рядом?", "Сколько стоит?"]
      };
    }
    if (s.general) return generalReply(s.general);

    if (/^(?:привет|здравствуй|добрый|доброе|доброго|хай|hello|hi)/.test(s.text)) return intro();
    if (/спасибо|благодар/.test(s.text)) return { text: "Пожалуйста! Если появятся вопросы, пишите.", chips: ["Подобрать квартиру"] };
    if (/заброн|бронь|оформ/.test(s.text)) {
      var target = pageFlat || (c.lastFlat ? flatBySlug(c.lastFlat) : null);
      if (target) return { text: "Бронь оформляется на странице квартиры: выберите даты и нажмите «Забронировать».", flats: [flatCard(target, stay, c.guests)] };
      return { text: "Сначала выберем квартиру. Сколько вас будет и на какие даты?" };
    }
    if (/администратор|оператор|человек|позвон|менеджер/.test(s.text)) {
      return { text: "На рабочем сайте на этом шаге я зову администратора, и он продолжает разговор в этом же окне.\nВ демо администратора нет." };
    }
    return handoff();
  }

  /* ---------- Хранение разговора на время визита ---------- */

  function save() {
    try {
      window.sessionStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (error) {
      /* Хранилище может быть закрыто: чат работает и без него. */
    }
  }

  function load() {
    try {
      var saved = JSON.parse(window.sessionStorage.getItem(STORE_KEY) || "null");
      if (saved && Array.isArray(saved.log)) state = { open: Boolean(saved.open), log: saved.log, ctx: saved.ctx || {} };
    } catch (error) {
      /* Начинаем с пустого разговора. */
    }
  }

  /* ---------- Окно чата ---------- */

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  var launcher = el("button", "chat-launcher", "Спросить помощника");
  launcher.type = "button";
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-controls", "chat-panel");

  var panel = el("section", "chat-panel");
  panel.id = "chat-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Помощник по подбору квартир");

  var head = el("div", "chat-head");
  var headText = el("div");
  headText.appendChild(el("p", "chat-title", "Помощник"));
  headText.appendChild(el("p", "chat-sub", "Показательный: отвечает по правилам на вымышленных данных. На рабочем сайте здесь работает нейросеть."));
  var close = el("button", "chat-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Закрыть помощника");
  head.appendChild(headText);
  head.appendChild(close);

  var log = el("div", "chat-log");
  log.setAttribute("role", "log");
  log.setAttribute("aria-live", "polite");

  var chipsBox = el("div", "chat-chips");

  var form = el("form", "chat-form");
  var input = el("input", "chat-input");
  input.type = "text";
  input.name = "message";
  input.autocomplete = "off";
  input.maxLength = 300;
  input.placeholder = "Например: трое, с 16 по 19 октября";
  input.setAttribute("aria-label", "Сообщение помощнику");
  var send = el("button", "button chat-send", "Отправить");
  send.type = "submit";
  form.appendChild(input);
  form.appendChild(send);

  panel.appendChild(head);
  panel.appendChild(log);
  panel.appendChild(chipsBox);
  panel.appendChild(form);

  function renderMessage(message) {
    var box = el("div", "chat-msg chat-msg-" + message.who);
    box.appendChild(el("p", "chat-text", message.text));
    (message.flats || []).forEach(function (card) {
      var link = el("a", "chat-flat");
      link.href = ROOT + "kvartiry/" + card.slug + ".html" + (card.query || "");
      link.appendChild(el("strong", null, card.name));
      link.appendChild(el("span", null, card.line));
      link.appendChild(el("span", "chat-flat-price", card.price));
      box.appendChild(link);
    });
    log.appendChild(box);
  }

  function renderChips(chips) {
    chipsBox.textContent = "";
    (chips || []).forEach(function (text) {
      var chip = el("button", "chat-chip", text);
      chip.type = "button";
      chip.addEventListener("click", function () { ask(text); });
      chipsBox.appendChild(chip);
    });
  }

  function scrollDown() {
    log.scrollTop = log.scrollHeight;
  }

  function push(message) {
    state.log.push(message);
    if (state.log.length > 60) state.log = state.log.slice(-60);
    renderMessage(message);
    renderChips(message.who === "bot" ? message.chips : []);
    scrollDown();
    save();
  }

  var busy = false;

  function ask(text) {
    text = text.trim();
    if (!text || busy || !flats.length) return;
    push({ who: "me", text: text });
    busy = true;
    var typing = el("div", "chat-msg chat-msg-bot chat-typing", "Смотрю данные…");
    log.appendChild(typing);
    scrollDown();
    window.setTimeout(function () {
      typing.remove();
      var answer;
      try {
        answer = reply(text);
      } catch (error) {
        answer = handoff();
      }
      answer.who = "bot";
      if (!answer.chips || !answer.chips.length) answer.chips = ["Подобрать квартиру", "Как проходит заселение?"];
      busy = false;
      push(answer);
    }, 450);
  }

  function open(byUser) {
    state.open = true;
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    launcher.hidden = true;
    if (!flats.length) {
      log.textContent = "";
      log.appendChild(el("div", "chat-msg chat-msg-bot", "Загружаю данные о квартирах…"));
      fetch(DATA_URL)
        .then(function (response) {
          if (!response.ok) throw new Error(String(response.status));
          return response.json();
        })
        .then(function (data) {
          site = data.site;
          flats = data.flats;
          log.textContent = "";
          if (state.log.length) {
            state.log.forEach(renderMessage);
            var last = state.log[state.log.length - 1];
            renderChips(last.who === "bot" ? last.chips : []);
            scrollDown();
          } else {
            var hello = intro();
            hello.who = "bot";
            push(hello);
          }
        })
        .catch(function () {
          log.textContent = "";
          log.appendChild(el("div", "chat-msg chat-msg-bot", "Не получилось загрузить данные о квартирах. Обновите страницу и откройте помощника ещё раз."));
        });
    }
    save();
    if (byUser) input.focus();
  }

  function shut() {
    state.open = false;
    panel.hidden = true;
    launcher.hidden = false;
    launcher.setAttribute("aria-expanded", "false");
    save();
    launcher.focus();
  }

  launcher.addEventListener("click", function () { open(true); });
  close.addEventListener("click", shut);
  panel.addEventListener("keydown", function (event) {
    if (event.key === "Escape") shut();
  });
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var text = input.value;
    input.value = "";
    ask(text);
  });

  load();
  document.body.appendChild(launcher);
  document.body.appendChild(panel);
  if (state.open) open(false);
})();
