/* Global variable */
let baseUrl;

// chrome.storage.%area%.get を promise で包んだもの
const getChromeStorage = async (area, keys) => {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage[area].get(keys, (items) => {
        resolve(items);
      });
    } catch (err) {
      reject(err);
    }
  });
}

// chrome.storage.%area%.set を promise で包んだもの
const setChromeStorage = async (area, items) => {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage[area].set(items, () => {
        resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
}

// chrome.runtime.sendMessage を promise で包んだもの
const runtimeSendMessage = async (message) => {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response);
      });
    } catch (err) {
      reject(err);
    }
  });
}

const Indicator = function () {
  this.loader = document.createElement('div');
  this.loader.classList.add('alpha-attendance-loader');

  this.indicator = document.createElement('div');
  this.indicator.classList.add('alpha-attendance-indicator');
  this.indicator.classList.add('hidden');
  this.indicator.appendChild(this.loader);

  let body = document.body;
  if (body.tagName === 'FRAMESET') {
    body = document.getElementsByTagName('html')[0];
  }
  body.appendChild(this.indicator);
}
Indicator.prototype.show = function () {
  this.indicator.classList.remove('hidden');
}
Indicator.prototype.hide = function () {
  this.indicator.classList.add('hidden');
}

// 一括入力ダイアログを作成する
const createBatchInputDialog = (doc, patterns) => {
  const pageOverlay = doc.createElement('div');
  pageOverlay.classList.add('alpha-attendance-page-overlay');
  pageOverlay.addEventListener('mousedown', () => {
    close();
  });

  const dialog = doc.createElement('div');
  dialog.classList.add('alpha-attendance-dialog');
  dialog.setAttribute('id', 'batch-input-dialog');
  dialog.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });

  // title section
  const titleSection = doc.createElement('section');
  const title = doc.createElement('label');
  title.textContent = '予定一括入力';
  title.classList.add('dialog-title');
  titleSection.appendChild(title);
  dialog.appendChild(titleSection);

  // body section
  const bodySection = doc.createElement('section');
  bodySection.classList.add('body-section');
  // batch input table
  const table = doc.createElement('table');
  table.classList.add('alpha-attendance-table');
  const headRow = table.createTBody().insertRow();
  const headers = ['形態', '開始', '終了'];
  for (let head of headers) {
    const th = doc.createElement('th');
    th.textContent = head;
    headRow.appendChild(th);
  }
  const tr = table.tBodies.item(0).insertRow();
  const elements = [
    createPatternSelector(doc, 'batch-pattern', null, 'FUTURE', 0, patterns),
    createTimePicker(doc, 'batch-start', null, 'FUTURE'),
    createTimePicker(doc, 'batch-end', null, 'FUTURE'),
  ];
  for (let element of elements) {
    const cell = tr.insertCell();
    cell.appendChild(element);
  }
  bodySection.appendChild(table);
  dialog.appendChild(bodySection);

  // buttons section
  const buttonsSection = doc.createElement('section');
  buttonsSection.classList.add('buttons-section');
  // cancel button
  const cancelButton = doc.createElement('div');
  cancelButton.classList.add('dialog-button-cancel');
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('mousedown', () => {
    close();
  });
  buttonsSection.appendChild(cancelButton);
  // done button
  const doneButton = doc.createElement('div');
  doneButton.classList.add('dialog-button-done');
  doneButton.textContent = 'Done';
  doneButton.addEventListener('mousedown', () => {
    const patternTag = elements[0];
    const pattern = patternTag.selectedIndex;
    const startTime = elements[1].value;
    const endTime = elements[2].value;
    const trs = doc.querySelectorAll('body > table.alpha-attendance-table tbody > tr:not(.stateRecognition):not(.statePresent)');

    for (let tr of trs) {
      const dayOffTag = tr.querySelector('[name="day-off"]');
      if (!dayOffTag || dayOffTag.checked) continue;

      const patternTag = tr.querySelector('[name="pattern"]');
      const startTag = tr.querySelector('[name="start"]');
      const endTag = tr.querySelector('[name="end"]');

      patternTag.selectedIndex = pattern;
      startTag.value = startTime;
      endTag.value = endTime;
    }

    close();
  });
  buttonsSection.appendChild(doneButton);
  dialog.appendChild(buttonsSection);

  pageOverlay.appendChild(dialog);
  doc.body.appendChild(pageOverlay);

  /** ダイアログを開く */
  const open = () => {
    pageOverlay.classList.add('opened');
  }

  /** ダイアログを閉じる */
  const close = () => {
    pageOverlay.classList.remove('opened');
  }

  /** ダイアログの位置を設定する */
  const setPosition = (x, y) => {
    dialog.style.left = x + 'px';
    dialog.style.top = y + 'px';
  }

  return {
    open: open,
    close: close,
    setPosition: setPosition,
  }
}

// 勤務表テーブル上部にツールボックスを生成する
const createToolBox = (doc, table, patterns, yearMonth) => {
  const box = doc.createElement('div');
  box.classList.add('alpha-attendance-toolbox');
  const batchInputDialog = createBatchInputDialog(doc, patterns);

  const batchInput = doc.createElement('div');
  batchInput.classList.add('tool-item');
  batchInput.textContent = '一括入力';
  batchInput.addEventListener('mousedown', (e) => {
    batchInputDialog.setPosition(e.clientX, e.clientY);
    batchInputDialog.open();
  });
  box.appendChild(batchInput);

  const register = doc.createElement('div');
  register.classList.add('tool-item');
  register.textContent = '予定登録';
  register.addEventListener('mousedown', async () => {
    const estimates = [];
    const trs = doc.querySelectorAll('body > table.alpha-attendance-table > tbody > tr');

    for (let tr of trs) {
      const dayOffTag = tr.querySelector('[name="day-off"]');
      if (!dayOffTag) continue;
      const patternTag = tr.querySelector('[name="pattern"]');
      const pattern = patternTag.options[patternTag.selectedIndex].value;
      const startTag = tr.querySelector('[name="start"]');
      const endTag = tr.querySelector('[name="end"]');
      const unclaimedtag = tr.querySelector('[name="unclaim"]');

      const estimate = {
        date: moment({y: yearMonth.year, M: yearMonth.month - 1, d: getRowDate(tr)}).format('YYYY-MM-DD'),
        dayOff: dayOffTag.checked,
        workPatternId: pattern,
        startTime: startTag.value,
        endTime: endTag.value,
        unclaimedHours: unclaimedtag.value,
      };
      estimates.push(estimate);
    }

    const items = await getChromeStorage('local', ['user']);
    await runtimeSendMessage({
      action: 'registerEstimates',
      values: {
        memberId: items.user,
        detail: estimates,
      },
    });
  });
  box.appendChild(register);

  const thead = table.createTHead();
  const headRow = thead.insertRow();
  const cell = headRow.insertCell();
  cell.colSpan = 15;
  cell.appendChild(box);
}

// 行から日付を取得
const getRowDate = (row) => {
  const dateTag = row.querySelector('td:first-child > a');
  return dateTag.textContent.match(/^\d+/) - 0;
}

// 時刻・時間入力アイテム作成
const createTimePicker = (doc, name, now, viewState, rowDate) => {
  const tag = doc.createElement('input');
  tag.setAttribute('name', name);
  tag.classList.add('alpha-attendance-input-time');
  tag.readOnly = isReadonly(viewState, rowDate, now);

  if (!tag.readOnly) {
    tag.addEventListener('focus', (e) => {
      tag.select();
    });
    tag.addEventListener('input', (e) => {
      const input = e.data;
      const value = e.target.value;
      if (input && !(/[0-9]/.test(input))) {
        e.target.value = value.slice(0, -1);
      } else if (input && value.length === 2) {
        e.target.value += ':';
      } else if (input && value.length > 5) {
        e.target.value = value.substr(0, 5);
      }
    });
  }

  return tag;
}

// 勤務形態選択アイテム作成
const createPatternSelector = (doc, name, now, viewState, rowDate, patterns) => {
  let tag;
  if (isReadonly(viewState, rowDate, now)) {
    tag = doc.createElement('input');
    tag.classList.add('alpha-attendance-display-pattern');
    tag.readOnly = true;
  } else {
    tag = doc.createElement('select');
    tag.classList.add('alpha-attendance-select-pattern');
    for (let pattern of patterns) {
      const option = doc.createElement('option');
      option.value = pattern.workPatternId || null;
      option.textContent = pattern.label || pattern.workPatternId || '';
      tag.appendChild(option);
    }
  }
  tag.setAttribute('name', name);

  return tag;
}

// 読み取り専用にするか
const isReadonly = (viewState, rowDate, now) => {
  return (viewState === 'PAST' || (viewState === 'CURRENT' && now.day >= rowDate));
}

// 表示中の勤務表の年月を取得
const getYearMonth = (doc, now) => {
  // 表示している勤務表の年月
  const d = doc.forms['dateForm'].date.value;
  const y = d.split('/')[0] - 0;
  const m = d.split('/')[1] - 0;
  let state;
  if (now.year > y || (now.year === y && now.month > m)) {
    state = 'PAST';
  } else if (now.year === y && now.month === m) {
    state = 'CURRENT';
  } else {
    state = 'FUTURE';
  }

  return {
    year: y,
    month: m,
    state: state,
  };
}

// 追加列の定義を生成
const createExtendColumnDefinitions = (doc, now) => {
  return [
    {
      header: '休暇(予定)',
      classes: ['alpha-attendance-center'],
      innerTag: (viewState, rowDate, row, data, patterns) => {
        const tag = doc.createElement('label');
        const checkbox = doc.createElement('input');
        checkbox.setAttribute('type', 'checkbox');
        checkbox.checked = data ? data.dayOff : row.firstElementChild.classList.contains('holiday');
        checkbox.disabled = isReadonly(viewState, rowDate, now);
        checkbox.setAttribute('name', 'day-off');

        tag.addEventListener('change', () => {
          tag.style.background = checkbox.checked ? '#f99' : '';
        });
        tag.style.background = checkbox.checked ? '#f99' : '';
        tag.appendChild(checkbox);

        return tag;
      }
    },
    {
      header: '形態(予定)',
      innerTag: (viewState, rowDate, row, data, patterns) => {
        const tag = createPatternSelector(doc, 'pattern', now, viewState, rowDate, patterns);
        if (data && tag.tagName === 'INPUT') {
          tag.value = data.workPatternId;
        } else if (data && tag.tagName === 'SELECT') {
          const option = tag.querySelector('option[value="' + data.workPatternId + '"]');
          const list = Array.apply(null, tag.querySelectorAll('option'));
          tag.selectedIndex = list.indexOf(option);
        }
        return tag;
      },
    },
    {
      header: '開始(予定)',
      classes: ['right'],
      innerTag: (viewState, rowDate, row, data) => {
        const tag = createTimePicker(doc, 'start', now, viewState, rowDate);
        if (data) tag.value = data.startTime;
        return tag;
      },
    },
    {
      header: '終了(予定)',
      classes: ['right'],
      innerTag: (viewState, rowDate, row, data) => {
        const tag = createTimePicker(doc, 'end', now, viewState, rowDate);
        if (data) tag.value = data.endTime;
        return tag;
      },
    },
    {
      header: '非請求(予定)',
      classes: ['right'],
      innerTag: (viewState, rowDate, row, data) => {
        const tag = createTimePicker(doc, 'unclaim', now, viewState, rowDate);
        if (data) tag.value = data.unclaimedHours === '00:00' ? '' : data.unclaimedHours;
        return tag;
      },
    },
    {
      header: '稼働(予定)',
      classes: ['right'],
      innerTag: (viewState, rowDate, row, data) => {
        const tag = createTimePicker(doc, 'claim', null, 'PAST', null);
        if (data) tag.value = data.estimateHours
        return tag;
      },
    },
  ];
}

// 勤務表を拡張する
const extendAttendanceList = async (doc, now, yearMonth) => {
  let table;
  for (let child of doc.body.childNodes) {
    if (child.textContent === '週／月切替') {
      table = child.nextSibling;
      break;
    }
  }
  table.classList.add('alpha-attendance-table');

  // 追加列の定義
  const columnDefinitions = createExtendColumnDefinitions(doc, now);

  // 列を追加する
  const appendColumns = async (responses) => {
    const workPatternsResponse = responses.shift();
    const estimatesResponse = responses.shift();

    if (workPatternsResponse.error || estimatesResponse.error) {
      const messages = [];
      workPatternsResponse.error && messages.push(workPatternsResponse.message);
      estimatesResponse.error && messages.push(estimatesResponse.message);

      await setChromeStorage('local', {
        status: 'GetEstimatesInfoFailed',
        message: messages.join('\n'),
      });
      await runtimeSendMessage({
        action: 'setBadge',
        values: {
          type: 'error',
        },
      });
      return;
    }

    const patterns = workPatternsResponse.data;
    patterns.unshift('');
    const estimates = estimatesResponse.data;

    createToolBox(doc, table, patterns, yearMonth);

    // 列ヘッダを追加する
    const rows = Array.apply(null, table.querySelectorAll('tbody>tr'));
    const headElement = rows.shift();
    for (let definition of columnDefinitions) {
      const th = doc.createElement('th');
      th.textContent = definition.header;
      headElement.appendChild(th);
    }

    // 各行に列を追加する
    for (let row of rows) {
      const rowDate = getRowDate(row);
      let data;
      while (estimates.length) {
        const estimate = estimates[0];
        const estimateDate = estimate ? (moment(estimate.date).format('D') - 0) : 0;
        console.log(estimateDate, rowDate);
        if (estimateDate < rowDate) {
          estimates.shift();
        } else if (estimateDate === rowDate) {
          // 行の日付と一致するデータを使う
          data = estimates.shift();
          break;
        }
      }
      console.log(data);

      for (let definition of columnDefinitions) {
        const td = doc.createElement('td');
        if (definition.classes) {
          for (let clazz of definition.classes) {
            td.classList.add(clazz);
          }
        }
        td.appendChild(definition.innerTag(yearMonth.state, rowDate, row, data, patterns));
        row.appendChild(td);
      }
    }
  }

  // 勤務形態リストを取得する
  const items = await getChromeStorage('local', ['user']);
  const response = await runtimeSendMessage({
    actions: ['getPatterns', 'getUserEstimates'],
    values: [{}, {
      year: yearMonth.year,
      month: yearMonth.month,
      user: items.user,
    }],
  });
  await appendColumns(response);
}

// 画面に応じて処理分岐
const steering = async () => {
  const items = await getChromeStorage('sync', ['ssl', 'host', 'port']);
  const host = items.host;
  const port = items.port;
  if (!host) return;

  const url = [];
  url.push(items.ssl ? 'https:/' : 'http:/');
  url.push(host + ':' + port);
  baseUrl = url.join('/');
  await runtimeSendMessage({action: 'connection'})
  .catch((err) => {
    setChromeStorage('local', {
      status: 'ConnectionConfirmationFailure',
      message: 'Connection confirmation failure.',
    });
    throw err;
  });

  const form = document.forms['login/loginForm'];
  const mainFrame = parent.view;
  const menuFrame = parent.menu;

  if (form) {
    funcs.loginForm(form);
  } else if (mainFrame && menuFrame) {
    funcs.mainContent(mainFrame, menuFrame);
  }
}

const funcs = {};

/* ログインページ */
funcs.loginForm = (form) => {
  const elements = form.elements;
  let userIDForm, passwordForm;
  const indicator = new Indicator();

  let preventEvent = true;
  form.addEventListener('submit', async (e) => {
    if (!preventEvent) return;

    e.preventDefault();
    indicator.show();

    const target = e.target;
    const utf8arr = CryptoJS.enc.Utf8.parse(passwordForm.value);
    const hash = CryptoJS.SHA256(utf8arr);
    const passwordHash = CryptoJS.enc.Base64.stringify(hash);

    const response = await runtimeSendMessage({
      action: 'login',
      values: {
        id: userIDForm.value,
        password: passwordHash,
      },
    });
    await setChromeStorage('local', response);
    preventEvent = false;
    form.submit();
  });

  for (let element of elements) {
    const type = element.type;

    if (type === 'text') {
      userIDForm = element;
    }
    if (type === 'password') {
      passwordForm = element;
    }
  }
}

/* メインページ */
funcs.mainContent = (view, menu) => {
  const indicator = new Indicator();

  // 現在日付
  const n = new Date();
  const now = {
    year: n.getFullYear(),
    month: n.getMonth() + 1,
    day: n.getDate(),
  };

  // menu frame
  menu.frameElement.addEventListener('load', (e) => {
    const doc = e.target.contentWindow.document;

    // Logout hook
    const logoutElement = doc.getElementsByClassName('logout')[0];
    logoutElement.addEventListener('click', async (event) => {
      // ログアウトをキャンセル
      event.preventDefault();

      indicator.show();
      const items = await getChromeStorage('local', ['user']);
      await runtimeSendMessage({
        action: 'logout',
        values: {
          id: items.user
        },
      });
      // Logout したら storage をクリアする
      await runtimeSendMessage({
        action: 'setBadge',
        values: {
          type: 'clear',
        },
      });
      chrome.storage.local.clear(() => {
        // ログアウト実行
        const href = event.target.getAttribute('href');
        location.href = href;
      });
    });
  });

  // view frame
  view.frameElement.addEventListener('load', (e) => {
    const doc = e.target.contentWindow.document;
    const title = doc.title;

    // Style Sheet を埋め込む
    const link = doc.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('type', 'text/css');
    link.setAttribute('href', [baseUrl, 'css/attendance.css'].join('/'));
    doc.head.appendChild(link);

    if (title.startsWith('勤務表')) {
      // 勤務表
      const yearMonth = getYearMonth(doc, now);
      extendAttendanceList(doc, now, yearMonth);
    } else if (title.startsWith('報告書作成')) {
      // 報告書作成
      const inputForm = doc.forms['inputForm'];
      console.log(inputForm);
      const submitButton = inputForm.querySelector('[value="提出"]');

      submitButton.addEventListener('mousedown', async () => {
        const items = await getChromeStorage('local', ['user']);
        await runtimeSendMessage({
          action: 'registerActual',
          values: {
            memberId: items.user,
            date: moment().format('YYYY-MM-DD'),
            workPattern: pattern,
            detail: actuals,
          },
        });
      });
    } else if (title.startsWith('作業内容編集')) {
      // 作業内容編集
      setChromeStorage('local', {
        actualDetails: [],
      });
    }
  });
}

// すべてのはじまり
steering().then(() => null).catch((err) => console.error(err));
