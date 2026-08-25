/* Liveclass page behaviour.
   Prototype notes:
   - Availability check calls liveclass-api.php; if that fails (static preview),
     it falls back to an in-browser simulation using the same rules.
   - OTP is a stub (123456) — the live build must reuse the existing testai OTP flow.
   - track() logs named events; wire to the site's analytics layer on integration. */

(function () {
  'use strict';

  var API = 'liveclass-api.php';
  var ACADEMY_URL_FORMAT = '%s.iapply.io'; // TODO(business): UNCONFIRMED — placeholder format
  var STORAGE_KEY = 'lc_registration_draft';

  /* ------------------------------------------------------------ analytics --- */
  function track(name, params) {
    // TODO(stack): route to the site's analytics (gtag/dataLayer) using its naming convention.
    try {
      if (window.dataLayer) window.dataLayer.push(Object.assign({ event: name }, params || {}));
      else console.info('[lc-event]', name, params || {});
    } catch (e) {}
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-event]');
    if (el) track(el.getAttribute('data-event'));
  });

  /* ------------------------------------------------------------------ utm --- */
  (function captureUtm() {
    var qs = new URLSearchParams(location.search);
    var saved = {};
    try { saved = JSON.parse(sessionStorage.getItem('lc_utm') || '{}'); } catch (e) {}
    ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) {
      var v = qs.get(k) || saved[k] || '';
      if (v) saved[k] = v;
      var input = document.getElementById(k);
      if (input) input.value = v;
    });
    try { sessionStorage.setItem('lc_utm', JSON.stringify(saved)); } catch (e) {}
  })();

  /* ------------------------------------------------------------- slugify --- */
  function slugify(name) {
    return (name || '').toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/[\s-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  function academyUrl(slug) { return ACADEMY_URL_FORMAT.replace('%s', slug); }
  function initials(name) {
    var parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'YA';
    return ((parts[0][0] || '') + (parts[1] ? parts[1][0] : '')).toUpperCase() || 'YA';
  }

  // Mirror of lc_reserved_names seed — used only as an offline fallback.
  var RESERVED = ['iapply', 'canam', 'british council', 'britishcouncil', 'idp',
    'ielts official', 'cambridge', 'pearson', 'ets', 'toefl official', 'duolingo'];
  function blockedTerm(name) {
    var n = ' ' + slugify(name).replace(/-/g, ' ') + ' ';
    for (var i = 0; i < RESERVED.length; i++) {
      if (n.indexOf(' ' + RESERVED[i].replace(/[^a-z0-9 ]/g, '') + ' ') !== -1 ||
          n.replace(/ /g, '').indexOf(RESERVED[i].replace(/ /g, '')) !== -1) return RESERVED[i];
    }
    return null;
  }

  /* ------------------------------------------------- live academy preview --- */
  var previewName = document.getElementById('previewName');
  if (previewName) {
    previewName.addEventListener('input', function () {
      var name = this.value.trim() || 'Your Academy';
      var slug = slugify(this.value) || 'youracademy';
      document.getElementById('mockName').textContent = name;
      document.getElementById('mockInitials').textContent = initials(name);
      document.getElementById('mockUrl').textContent = academyUrl(slug);
      var heroName = document.getElementById('heroMockName');
      if (heroName) { heroName.textContent = name; document.getElementById('heroMockUrl').textContent = academyUrl(slug); }
      var heroInit = document.getElementById('heroMockInitials');
      if (heroInit) heroInit.textContent = initials(name);
      var line = document.getElementById('previewUrlLine');
      line.hidden = !this.value.trim();
      document.getElementById('previewUrl').textContent = academyUrl(slug);
      // carry the name into the registration form if empty there
      var f = document.getElementById('f_academy');
      if (f && !f.dataset.touched) { f.value = this.value; f.dispatchEvent(new Event('input')); }
    });
  }

  /* -------------------------------------------------- availability check --- */
  var academyInput = document.getElementById('f_academy');
  var statusBox = document.getElementById('academyStatus');
  var spinner = document.getElementById('academySpinner');
  var academyState = { slug: '', available: false };
  var debounceTimer = null;

  function localCheck(name) {
    var slug = slugify(name);
    if (!slug || slug.length < 3) return { status: 'invalid' };
    var blocked = blockedTerm(name);
    if (blocked) return { status: 'blocked' };
    var taken = [];
    try { taken = JSON.parse(localStorage.getItem('lc_taken_demo') || '[]'); } catch (e) {}
    if (taken.indexOf(slug) !== -1) {
      return { status: 'taken', alternatives: [slug + '-academy', slug + '-prep', slug + '-english'] };
    }
    return { status: 'available', slug: slug, url: academyUrl(slug) };
  }

  function renderStatus(res) {
    statusBox.className = 'lc-academy-status mt-2';
    academyState.available = false;
    if (!res || res.status === 'invalid') {
      statusBox.textContent = academyInput.value.trim() ? 'Use at least 3 letters or numbers.' : '';
      return;
    }
    if (res.status === 'available') {
      academyState.available = true;
      academyState.slug = res.slug;
      statusBox.classList.add('is-available');
      statusBox.innerHTML = '<i class="bi bi-check-circle-fill"></i> Available — your address would be <strong>' +
        res.url + '</strong> <span class="badge text-bg-light border">placeholder format</span>';
      track('lc_name_available');
    } else if (res.status === 'taken') {
      statusBox.classList.add('is-taken');
      var alts = (res.alternatives || []).map(function (a) {
        return '<button type="button" class="lc-alt" data-alt="' + a.replace(/"/g, '') + '">' + a + '</button>';
      }).join('');
      statusBox.innerHTML = '<i class="bi bi-exclamation-triangle-fill"></i> That name is taken. Try one of these:<br>' + alts;
    } else if (res.status === 'blocked') {
      statusBox.classList.add('is-blocked');
      statusBox.innerHTML = '<i class="bi bi-x-circle-fill"></i> That name contains a protected brand term and cannot be used. Please choose a name of your own.';
    }
  }

  if (academyInput) {
    academyInput.addEventListener('input', function () {
      this.dataset.touched = '1';
      clearTimeout(debounceTimer);
      var name = this.value;
      statusBox.textContent = '';
      statusBox.className = 'lc-academy-status mt-2';
      if (!name.trim()) return;
      spinner.hidden = false;
      debounceTimer = setTimeout(function () {
        track('lc_name_checked');
        fetch(API + '?action=check_name&name=' + encodeURIComponent(name), { headers: { 'X-Requested-With': 'fetch' } })
          .then(function (r) { if (!r.ok) throw 0; return r.json(); })
          .catch(function () { return localCheck(name); })
          .then(function (res) { spinner.hidden = true; renderStatus(res); });
      }, 400);
    });
    statusBox.addEventListener('click', function (e) {
      var alt = e.target.closest('[data-alt]');
      if (alt) {
        academyInput.value = alt.getAttribute('data-alt').replace(/-/g, ' ');
        academyInput.dispatchEvent(new Event('input'));
      }
    });
  }

  /* ------------------------------------------------------ multi-step form --- */
  var form = document.getElementById('lcForm');
  if (!form) return;

  var panels = form.querySelectorAll('.lc-step-panel');
  var stepsBar = document.getElementById('stepsBar');
  var current = 1;

  function goTo(step) {
    current = step;
    panels.forEach(function (p) { p.hidden = p.getAttribute('data-panel') != String(step); });
    stepsBar.querySelectorAll('li').forEach(function (li) {
      var n = parseInt(li.getAttribute('data-step'), 10);
      li.classList.toggle('is-current', n === step);
      li.classList.toggle('is-done', n < step);
    });
    var card = document.querySelector('.lc-form-card');
    if (card && step > 1) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    track('lc_step' + step + '_started');
    saveDraft();
  }

  function validatePanel(step) {
    var panel = form.querySelector('[data-panel="' + step + '"]');
    var ok = true;
    panel.querySelectorAll('input[required], select[required]').forEach(function (el) {
      if (!el.checkValidity()) { el.classList.add('is-invalid'); ok = false; }
      else el.classList.remove('is-invalid');
    });
    return ok;
  }

  /* draft persistence */
  function saveDraft() {
    var data = { step: current, fields: {} };
    form.querySelectorAll('input[id], select[id]').forEach(function (el) {
      if (el.type === 'radio') { if (el.checked) data.fields[el.name] = el.value; }
      else if (el.id !== 'hp') data.fields[el.id] = el.value;
    });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
  }
  (function restoreDraft() {
    var data = null;
    try { data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) {}
    if (!data) return;
    Object.keys(data.fields || {}).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = data.fields[id];
    });
    if (data.fields && data.fields.f_academy) academyInput.dispatchEvent(new Event('input'));
  })();
  form.addEventListener('input', saveDraft);
  window.addEventListener('beforeunload', function () {
    if (current > 1 && current < 4) track('lc_registration_abandoned', { step: current });
  });

  /* step 1 -> 2 */
  document.getElementById('toStep2').addEventListener('click', function () {
    if (document.getElementById('hp').value) return; // honeypot
    if (!validatePanel(1)) return;
    if (!academyState.available) {
      statusBox.classList.add('is-taken');
      if (!statusBox.textContent) statusBox.textContent = 'Please choose an available academy name first.';
      academyInput.focus();
      return;
    }
    document.getElementById('otpPhone').textContent = document.getElementById('f_phone').value;
    track('lc_step1_completed');
    goTo(2);
    var first = document.querySelector('.lc-otp-box');
    if (first) first.focus();
  });

  /* OTP boxes — STUB. TODO(stack): replace with existing OTP verify endpoint. */
  var otpBoxes = Array.prototype.slice.call(document.querySelectorAll('.lc-otp-box'));
  otpBoxes.forEach(function (box, i) {
    box.addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 1);
      if (this.value && otpBoxes[i + 1]) otpBoxes[i + 1].focus();
    });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !this.value && otpBoxes[i - 1]) otpBoxes[i - 1].focus();
    });
    box.addEventListener('paste', function (e) {
      var text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      if (text.length >= 2) {
        e.preventDefault();
        otpBoxes.forEach(function (b, j) { b.value = text[j] || ''; });
        (otpBoxes[Math.min(text.length, 5)] || box).focus();
      }
    });
  });
  document.getElementById('toStep3').addEventListener('click', function () {
    var code = otpBoxes.map(function (b) { return b.value; }).join('');
    var err = document.getElementById('otpError');
    if (code !== '123456') { err.hidden = false; return; }
    err.hidden = true;
    track('lc_step2_completed');
    goTo(3);
  });
  document.getElementById('backTo1').addEventListener('click', function () { goTo(1); });
  document.getElementById('backTo2').addEventListener('click', function () { goTo(2); });

  /* commitment totals */
  var totalEl = document.getElementById('commitTotal');
  function recalcTotal() {
    var total = 0;
    document.querySelectorAll('.lc-exam-commit').forEach(function (row) {
      var check = row.querySelector('.exam-check');
      var count = row.querySelector('.exam-count');
      if (count) count.disabled = !check.checked;
      if (check.checked && count && count.value) total += Math.max(0, parseInt(count.value, 10) || 0);
    });
    totalEl.textContent = total.toLocaleString('en-IN');
    return total;
  }
  document.getElementById('examCommits').addEventListener('input', recalcTotal);
  document.getElementById('examCommits').addEventListener('change', recalcTotal);

  /* office toggle */
  document.querySelectorAll('input[name="has_office"]').forEach(function (r) {
    r.addEventListener('change', function () {
      document.getElementById('officeCountWrap').hidden = this.value !== '1' || !this.checked;
    });
  });

  /* step 3 -> 4 */
  document.getElementById('toStep4').addEventListener('click', function () {
    if (!validatePanel(3)) return;
    var total = recalcTotal();
    var anyActive = Array.prototype.some.call(
      document.querySelectorAll('.exam-check:not([data-soon])'),
      function (c) { return c.checked; }
    );
    if (!anyActive || total < 1) {
      alert('Please select at least one live exam and enter the number of students you expect to enrol.');
      return;
    }
    var name = academyInput.value.trim();
    var slug = academyState.slug || slugify(name);
    document.getElementById('doneName').textContent = name;
    document.getElementById('doneInitials').textContent = initials(name);
    document.getElementById('doneUrl').textContent = academyUrl(slug);
    document.getElementById('doneTotal').textContent = total.toLocaleString('en-IN');

    var shareText = 'I have reserved my own English test prep academy — ' + name +
      ' (' + academyUrl(slug) + ') on iApply Liveclass. Live trainers, my brand. https://iapply.io/liveclass';
    document.getElementById('shareWa').href = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(shareText);

    // demo-only: remember the slug as taken so a re-check shows the "taken" state
    try {
      var taken = JSON.parse(localStorage.getItem('lc_taken_demo') || '[]');
      if (taken.indexOf(slug) === -1) taken.push(slug);
      localStorage.setItem('lc_taken_demo', JSON.stringify(taken));
    } catch (e) {}

    // TODO(stack): POST the full payload (with CSRF token) to the registration handler here.
    fetch(API + '?action=register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify(collectPayload(slug, total))
    }).catch(function () {});

    track('lc_step3_completed', { committed_students: total });
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    goTo(4);
    track('lc_registration_completed');
  });

  function collectPayload(slug, total) {
    var exams = [];
    document.querySelectorAll('.lc-exam-commit').forEach(function (row) {
      var check = row.querySelector('.exam-check');
      if (!check.checked) return;
      var count = row.querySelector('.exam-count');
      exams.push({ code: row.getAttribute('data-code'), committed: count ? parseInt(count.value, 10) || 0 : 0, interest_only: !count });
    });
    return {
      agency_name: val('f_agency'), contact_name: val('f_contact'), email: val('f_email'),
      phone: val('f_phone'), city: val('f_city'), state: val('f_state'), country: val('f_country'),
      academy_name: val('f_academy'), academy_slug: slug,
      exams: exams, total_committed_students: total,
      current_monthly_students: parseInt(val('f_monthly'), 10) || 0,
      has_physical_office: (document.querySelector('input[name="has_office"]:checked') || {}).value === '1',
      office_count: parseInt(val('f_offices'), 10) || 0,
      preferred_language: val('f_lang'),
      utm_source: val('utm_source'), utm_medium: val('utm_medium'), utm_campaign: val('utm_campaign'),
      source: 'liveclass_page'
    };
  }
  function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }

  /* -------------------------------------------------------------- FAQ ----- */
  var faqSearch = document.getElementById('faqSearch');
  var faqZero = document.getElementById('faqZero');
  var faqItems = Array.prototype.slice.call(document.querySelectorAll('.lc-faq'));
  var faqCats = Array.prototype.slice.call(document.querySelectorAll('.lc-faq-cat'));
  var searchTimer = null;

  function stripMarks(el) {
    el.querySelectorAll('mark').forEach(function (m) {
      m.replaceWith(document.createTextNode(m.textContent));
    });
    el.normalize();
  }
  function highlight(el, q) {
    stripMarks(el);
    if (!q) return;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    var re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    nodes.forEach(function (n) {
      if (!re.test(n.textContent)) return;
      var span = document.createElement('span');
      span.innerHTML = n.textContent.replace(re, '<mark>$1</mark>');
      n.replaceWith.apply(n, span.childNodes);
    });
  }

  function runSearch(q) {
    q = q.trim().toLowerCase();
    var hits = 0;
    faqItems.forEach(function (item) {
      var text = (item.textContent + ' ' + (item.getAttribute('data-keywords') || '')).toLowerCase();
      var match = !q || text.indexOf(q) !== -1;
      item.hidden = !match;
      if (match) hits++;
      var qEl = item.querySelector('.lc-faq-q');
      var aEl = item.querySelector('.lc-faq-a p');
      highlight(qEl, q); highlight(aEl, q);
      if (q && match) item.open = true;
      else if (!q) item.open = false;
    });
    faqCats.forEach(function (cat) {
      cat.hidden = !cat.querySelector('.lc-faq:not([hidden])');
    });
    faqZero.hidden = !(q && hits === 0);
    if (q) {
      track(hits === 0 ? 'lc_faq_zero_result' : 'lc_faq_searched', { query: q, results: hits });
      // log server-side (lc_faq_searches) when available
      fetch(API + '?action=log_search&q=' + encodeURIComponent(q) + '&n=' + hits,
        { headers: { 'X-Requested-With': 'fetch' } }).catch(function () {});
    }
  }
  if (faqSearch) {
    faqSearch.addEventListener('input', function () {
      clearTimeout(searchTimer);
      var q = this.value;
      searchTimer = setTimeout(function () { runSearch(q); }, 300);
    });
  }

  /* FAQ open tracking + helpful votes */
  faqItems.forEach(function (item) {
    item.addEventListener('toggle', function () {
      if (item.open) track('lc_faq_opened', { faq: item.id });
    });
  });
  document.querySelectorAll('.lc-helpful').forEach(function (box) {
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-vote]');
      if (!btn) return;
      var slug = box.getAttribute('data-slug');
      var key = 'lc_voted_' + slug;
      if (localStorage.getItem(key)) return;
      try { localStorage.setItem(key, btn.getAttribute('data-vote')); } catch (err) {}
      box.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
      box.querySelector('.lc-voted').hidden = false;
      fetch(API + '?action=faq_vote&slug=' + encodeURIComponent(slug) + '&vote=' + btn.getAttribute('data-vote'),
        { headers: { 'X-Requested-With': 'fetch' } }).catch(function () {});
    });
  });

  /* deep link #faq-slug */
  if (location.hash.indexOf('#faq-') === 0) {
    var target = document.getElementById(location.hash.slice(1));
    if (target) {
      target.open = true;
      setTimeout(function () { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 300);
    }
  }

  /* -------------------------------------------------- registration modal --- */
  var regModal = document.getElementById('regModal');
  var lastFocus = null;
  function openReg() {
    if (!regModal) return;
    lastFocus = document.activeElement;
    regModal.hidden = false;
    document.body.classList.add('lc-locked');
    track('lc_register_modal_opened');
    var first = regModal.querySelector('input:not([type=hidden]):not(.lc-hp)');
    if (first) setTimeout(function () { first.focus(); }, 60);
  }
  function closeReg() {
    if (!regModal) return;
    regModal.hidden = true;
    document.body.classList.remove('lc-locked');
    if (lastFocus) lastFocus.focus();
  }
  document.addEventListener('click', function (e) {
    var opener = e.target.closest('a[href="#register"], .lc-open-reg');
    if (opener) { e.preventDefault(); openReg(); return; }
    if (e.target.closest('[data-close-reg]')) closeReg();
  });

  /* ------------------------------------------------------ training overlay - */
  var training = document.getElementById('trainingOverlay');
  var slides = training ? Array.prototype.slice.call(training.querySelectorAll('.lc-slide')) : [];
  var dotsBox = document.getElementById('trainDots');
  var slideIdx = 0;
  if (training && dotsBox) {
    slides.forEach(function (_, i) {
      var d = document.createElement('button');
      d.type = 'button';
      d.setAttribute('aria-label', 'Slide ' + (i + 1));
      d.addEventListener('click', function () { showSlide(i); });
      dotsBox.appendChild(d);
    });
  }
  function showSlide(i) {
    slideIdx = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach(function (s, j) { s.hidden = j !== slideIdx; });
    dotsBox.querySelectorAll('button').forEach(function (b, j) { b.classList.toggle('is-on', j === slideIdx); });
    var next = document.getElementById('trainNext');
    var prev = document.getElementById('trainPrev');
    prev.disabled = slideIdx === 0;
    prev.style.visibility = slideIdx === 0 ? 'hidden' : 'visible';
    next.innerHTML = slideIdx === slides.length - 1
      ? 'Reserve my academy <i class="bi bi-arrow-right ms-1"></i>' : 'Next <i class="bi bi-arrow-right ms-1"></i>';
    training.querySelector('.lc-training-body').scrollTop = 0;
  }
  function openTraining(at) {
    if (!training) return;
    lastFocus = document.activeElement;
    training.hidden = false;
    document.body.classList.add('lc-locked');
    showSlide(at || 0);
    track('lc_training_opened', { slide: at || 0 });
  }
  function closeTraining() {
    if (!training) return;
    training.hidden = true;
    document.body.classList.remove('lc-locked');
    if (lastFocus) lastFocus.focus();
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-training-slide]');
    if (t) { openTraining(parseInt(t.getAttribute('data-training-slide'), 10)); return; }
    if (e.target.closest('[data-close-training]')) closeTraining();
  });
  if (training) {
    document.getElementById('trainPrev').addEventListener('click', function () { showSlide(slideIdx - 1); });
    document.getElementById('trainNext').addEventListener('click', function () {
      if (slideIdx === slides.length - 1) { closeTraining(); track('lc_training_completed'); openReg(); }
      else showSlide(slideIdx + 1);
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (training && !training.hidden) closeTraining();
      else if (regModal && !regModal.hidden) closeReg();
    }
    if (training && !training.hidden) {
      if (e.key === 'ArrowRight') showSlide(slideIdx + 1);
      if (e.key === 'ArrowLeft') showSlide(slideIdx - 1);
    }
  });

  /* ------------------------------------------------------------ batch tabs - */
  var batchTabs = document.querySelectorAll('[data-batch-tab]');
  batchTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var code = tab.getAttribute('data-batch-tab');
      batchTabs.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle('is-on', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      document.querySelectorAll('[data-batch-panel]').forEach(function (p) {
        p.classList.toggle('d-none', p.getAttribute('data-batch-panel') !== code);
      });
    });
  });

  /* ------------------------------------------------------- platform slider - */
  var slider = document.getElementById('platformSlider');
  if (slider) {
    var sTrack = document.getElementById('sliderTrack');
    var sSlides = sTrack.children;
    var sDots = document.getElementById('sliderDots');
    var sIdx = 0;
    for (var si = 0; si < sSlides.length; si++) {
      (function (n) {
        var d = document.createElement('button');
        d.type = 'button';
        d.setAttribute('aria-label', 'Screen ' + (n + 1));
        d.addEventListener('click', function () { sGo(n); });
        sDots.appendChild(d);
      })(si);
    }
    function sGo(i) {
      sIdx = (i + sSlides.length) % sSlides.length;
      sTrack.style.transform = 'translateX(-' + (sIdx * 100) + '%)';
      var btns = sDots.querySelectorAll('button');
      for (var j = 0; j < btns.length; j++) btns[j].classList.toggle('is-on', j === sIdx);
    }
    document.getElementById('slidePrev').addEventListener('click', function () { sGo(sIdx - 1); track('lc_slider_nav'); });
    document.getElementById('slideNext').addEventListener('click', function () { sGo(sIdx + 1); track('lc_slider_nav'); });
    /* touch swipe */
    var touchX = null;
    sTrack.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    sTrack.addEventListener('touchend', function (e) {
      if (touchX === null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 40) sGo(sIdx + (dx < 0 ? 1 : -1));
      touchX = null;
    }, { passive: true });
    sGo(0);
  }

  /* ------------------------------------------------ hero placeholder slider */
  var heroStrip = document.getElementById('heroShotStrip');
  if (heroStrip) {
    var heroSlides = heroStrip.children.length;
    var heroDotsBox = document.getElementById('heroShotDots');
    var heroIdx = 0, heroTimer = null;
    function heroGo(i) {
      heroIdx = (i + heroSlides) % heroSlides;
      heroStrip.style.transform = 'translateX(-' + (heroIdx * 100) + '%)';
      var ds = heroDotsBox.querySelectorAll('button');
      for (var j = 0; j < ds.length; j++) ds[j].classList.toggle('is-on', j === heroIdx);
    }
    for (var hi = 0; hi < heroSlides; hi++) {
      (function (n) {
        var d = document.createElement('button');
        d.type = 'button';
        d.setAttribute('aria-label', 'Slide ' + (n + 1));
        d.addEventListener('click', function () { heroGo(n); restartHeroTimer(); });
        heroDotsBox.appendChild(d);
      })(hi);
    }
    function restartHeroTimer() {
      if (heroTimer) clearInterval(heroTimer);
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        heroTimer = setInterval(function () { heroGo(heroIdx + 1); }, 3500);
      }
    }
    heroGo(0);
    restartHeroTimer();
  }

  /* ------------------------------------------------------- scroll reveals -- */
  var reveals = document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('lc-js'); // hidden state only exists with JS
    var rvObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); rvObserver.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    reveals.forEach(function (el) { rvObserver.observe(el); });
    // safety net: if the observer never fires (odd webviews), show everything
    setTimeout(function () {
      var shown = document.querySelectorAll('.rv.is-in').length;
      if (shown === 0) reveals.forEach(function (el) { el.classList.add('is-in'); });
    }, 1800);
  }

  /* ------------------------------------------------------- sticky mobile CTA */
  var sticky = document.getElementById('stickyCta');
  var hero = document.querySelector('.lc-hero');
  var registerSection = document.getElementById('register');
  if (sticky && hero && 'IntersectionObserver' in window) {
    var heroGone = false, inRegister = false;
    function updateSticky() { sticky.hidden = !(heroGone && !inRegister); }
    new IntersectionObserver(function (entries) {
      heroGone = !entries[0].isIntersecting; updateSticky();
    }, { threshold: 0 }).observe(hero);
    new IntersectionObserver(function (entries) {
      inRegister = entries[0].isIntersecting; updateSticky();
    }, { threshold: 0.15 }).observe(registerSection);
  }
})();
