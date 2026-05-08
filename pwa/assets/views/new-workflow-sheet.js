import { createSheet } from '../components/sheet.js';

function nanoid() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

function buildPostBody({ title, prompt, kind, policy, tasks }) {
  const workflowId = nanoid();

  const body = {
    id: workflowId,
    kind,
    tasks: [],
  };

  if (title.trim()) {
    body.title = title.trim();
  }

  if (kind === 'single-task') {
    body.tasks = [{ id: 'T1', title: '', prompt: prompt.trim() }];
  } else {
    body.tasks = tasks.map((t, i) => {
      const taskId = `T${i + 1}`;
      const task = { id: taskId, title: t.title.trim(), prompt: t.prompt.trim() };
      if (t.dependsOn && t.dependsOn.length > 0) {
        task.dependsOn = t.dependsOn;
      }
      return task;
    });
  }

  const policyObj = {};
  if (policy.autoLand) policyObj.autoLand = policy.autoLand;
  if (policy.autoMergeOnGreen) policyObj.autoMergeOnGreen = policy.autoMergeOnGreen;
  if (policy.maxConcurrent !== undefined && policy.maxConcurrent > 1) policyObj.maxConcurrent = policy.maxConcurrent;
  if (Object.keys(policyObj).length > 0) {
    body.policy = policyObj;
  }

  return body;
}

export function createNewWorkflowSheet({ onSubmit, onClose } = {}) {
  let tasks = [{ title: '', prompt: '', dependsOn: [] }];
  let kind = 'single-task';
  let policy = { autoLand: false, autoMergeOnGreen: false, maxConcurrent: 1 };

  const formEl = document.createElement('div');
  formEl.className = 'nwf-form';

  const errorEl = document.createElement('div');
  errorEl.className = 'nwf-error';
  errorEl.style.display = 'none';
  formEl.appendChild(errorEl);

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = msg ? '' : 'none';
  }

  function hideError() {
    showError('');
  }

  const promptGroup = document.createElement('div');
  promptGroup.className = 'nwf-field-group';

  const promptLabel = document.createElement('label');
  promptLabel.className = 'nwf-label';
  promptLabel.textContent = 'Prompt';

  const promptTextarea = document.createElement('textarea');
  promptTextarea.className = 'nwf-textarea nwf-prompt';
  promptTextarea.placeholder = 'Describe the task…';
  promptTextarea.rows = 3;
  promptTextarea.setAttribute('aria-label', 'Workflow prompt');

  promptTextarea.addEventListener('input', () => {
    promptTextarea.style.height = 'auto';
    promptTextarea.style.height = promptTextarea.scrollHeight + 'px';
    hideError();
  });

  promptGroup.appendChild(promptLabel);
  promptGroup.appendChild(promptTextarea);
  formEl.appendChild(promptGroup);

  const titleGroup = document.createElement('div');
  titleGroup.className = 'nwf-field-group';

  const titleLabel = document.createElement('label');
  titleLabel.className = 'nwf-label';
  titleLabel.textContent = 'Title (optional)';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'nwf-input nwf-title';
  titleInput.placeholder = 'Short title…';
  titleInput.setAttribute('aria-label', 'Workflow title');

  titleGroup.appendChild(titleLabel);
  titleGroup.appendChild(titleInput);
  formEl.appendChild(titleGroup);

  const kindGroup = document.createElement('div');
  kindGroup.className = 'nwf-field-group';

  const kindLabel = document.createElement('label');
  kindLabel.className = 'nwf-label';
  kindLabel.textContent = 'Kind';

  const segmentedControl = document.createElement('div');
  segmentedControl.className = 'nwf-segmented';
  segmentedControl.setAttribute('role', 'group');
  segmentedControl.setAttribute('aria-label', 'Workflow kind');

  const kindSingle = document.createElement('button');
  kindSingle.type = 'button';
  kindSingle.className = 'nwf-segment active';
  kindSingle.textContent = 'single-task';
  kindSingle.dataset.kind = 'single-task';

  const kindMulti = document.createElement('button');
  kindMulti.type = 'button';
  kindMulti.className = 'nwf-segment';
  kindMulti.textContent = 'multi-task';
  kindMulti.dataset.kind = 'multi-task';

  segmentedControl.appendChild(kindSingle);
  segmentedControl.appendChild(kindMulti);

  kindGroup.appendChild(kindLabel);
  kindGroup.appendChild(segmentedControl);
  formEl.appendChild(kindGroup);

  const policyGroup = document.createElement('div');
  policyGroup.className = 'nwf-field-group';

  const policyLabel = document.createElement('label');
  policyLabel.className = 'nwf-label';
  policyLabel.textContent = 'Policy';

  const autoLandRow = document.createElement('div');
  autoLandRow.className = 'nwf-toggle-row';
  const autoLandCheck = document.createElement('input');
  autoLandCheck.type = 'checkbox';
  autoLandCheck.id = 'nwf-auto-land';
  autoLandCheck.className = 'nwf-checkbox';
  const autoLandLbl = document.createElement('label');
  autoLandLbl.htmlFor = 'nwf-auto-land';
  autoLandLbl.className = 'nwf-toggle-label';
  autoLandLbl.textContent = 'Auto land';
  autoLandRow.appendChild(autoLandCheck);
  autoLandRow.appendChild(autoLandLbl);

  const autoMergeRow = document.createElement('div');
  autoMergeRow.className = 'nwf-toggle-row';
  const autoMergeCheck = document.createElement('input');
  autoMergeCheck.type = 'checkbox';
  autoMergeCheck.id = 'nwf-auto-merge';
  autoMergeCheck.className = 'nwf-checkbox';
  const autoMergeLbl = document.createElement('label');
  autoMergeLbl.htmlFor = 'nwf-auto-merge';
  autoMergeLbl.className = 'nwf-toggle-label';
  autoMergeLbl.textContent = 'Auto merge on green';
  autoMergeRow.appendChild(autoMergeCheck);
  autoMergeRow.appendChild(autoMergeLbl);

  const maxConcRow = document.createElement('div');
  maxConcRow.className = 'nwf-toggle-row';
  const maxConcLbl = document.createElement('label');
  maxConcLbl.htmlFor = 'nwf-max-concurrent';
  maxConcLbl.className = 'nwf-toggle-label';
  maxConcLbl.textContent = 'Max concurrent';
  const maxConcInput = document.createElement('input');
  maxConcInput.type = 'number';
  maxConcInput.id = 'nwf-max-concurrent';
  maxConcInput.className = 'nwf-stepper';
  maxConcInput.min = '1';
  maxConcInput.max = '16';
  maxConcInput.value = '1';
  maxConcInput.setAttribute('aria-label', 'Max concurrent tasks');
  maxConcRow.appendChild(maxConcLbl);
  maxConcRow.appendChild(maxConcInput);

  policyGroup.appendChild(policyLabel);
  policyGroup.appendChild(autoLandRow);
  policyGroup.appendChild(autoMergeRow);
  policyGroup.appendChild(maxConcRow);
  formEl.appendChild(policyGroup);

  const multiTaskSection = document.createElement('div');
  multiTaskSection.className = 'nwf-multi-task-section';
  multiTaskSection.style.display = 'none';

  const taskListEl = document.createElement('div');
  taskListEl.className = 'nwf-task-list';

  const addTaskBtn = document.createElement('button');
  addTaskBtn.type = 'button';
  addTaskBtn.className = 'nwf-add-task-btn';
  addTaskBtn.textContent = '+ Add task';

  multiTaskSection.appendChild(taskListEl);
  multiTaskSection.appendChild(addTaskBtn);
  formEl.appendChild(multiTaskSection);

  const footer = document.createElement('div');
  footer.className = 'nwf-footer';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'nwf-submit-btn';
  submitBtn.textContent = 'Create workflow';

  footer.appendChild(submitBtn);
  formEl.appendChild(footer);

  function renderTaskList() {
    taskListEl.innerHTML = '';
    tasks.forEach((task, idx) => {
      const row = document.createElement('div');
      row.className = 'nwf-task-row';

      const rowHeader = document.createElement('div');
      rowHeader.className = 'nwf-task-row-header';

      const taskIdLabel = document.createElement('span');
      taskIdLabel.className = 'nwf-task-id-label';
      taskIdLabel.textContent = `T${idx + 1}`;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'nwf-task-remove-btn';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', `Remove task T${idx + 1}`);
      removeBtn.addEventListener('click', () => {
        tasks.splice(idx, 1);
        tasks.forEach((t, i) => {
          t.dependsOn = t.dependsOn.filter((dep) => {
            const depIdx = parseInt(dep.slice(1), 10) - 1;
            return depIdx < tasks.length && depIdx !== idx;
          });
        });
        renderTaskList();
      });

      rowHeader.appendChild(taskIdLabel);
      rowHeader.appendChild(removeBtn);
      row.appendChild(rowHeader);

      const taskTitleInput = document.createElement('input');
      taskTitleInput.type = 'text';
      taskTitleInput.className = 'nwf-input nwf-task-title';
      taskTitleInput.placeholder = 'Task title (optional)';
      taskTitleInput.value = task.title;
      taskTitleInput.setAttribute('aria-label', `Task T${idx + 1} title`);
      taskTitleInput.addEventListener('input', () => {
        tasks[idx].title = taskTitleInput.value;
      });
      row.appendChild(taskTitleInput);

      const taskPromptTextarea = document.createElement('textarea');
      taskPromptTextarea.className = 'nwf-textarea nwf-task-prompt';
      taskPromptTextarea.placeholder = 'Task prompt…';
      taskPromptTextarea.rows = 2;
      taskPromptTextarea.value = task.prompt;
      taskPromptTextarea.setAttribute('aria-label', `Task T${idx + 1} prompt`);
      taskPromptTextarea.addEventListener('input', () => {
        tasks[idx].prompt = taskPromptTextarea.value;
        taskPromptTextarea.style.height = 'auto';
        taskPromptTextarea.style.height = taskPromptTextarea.scrollHeight + 'px';
        hideError();
      });
      row.appendChild(taskPromptTextarea);

      if (idx > 0) {
        const depsLabel = document.createElement('div');
        depsLabel.className = 'nwf-deps-label';
        depsLabel.textContent = 'Depends on:';
        row.appendChild(depsLabel);

        const depsRow = document.createElement('div');
        depsRow.className = 'nwf-deps-row';

        for (let j = 0; j < idx; j++) {
          const depId = `T${j + 1}`;
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'nwf-dep-chip';
          chip.dataset.dep = depId;
          chip.textContent = depId;
          const isSelected = task.dependsOn.includes(depId);
          if (isSelected) chip.classList.add('selected');
          chip.setAttribute('aria-pressed', String(isSelected));
          chip.addEventListener('click', () => {
            const depList = tasks[idx].dependsOn;
            const depIndex = depList.indexOf(depId);
            if (depIndex === -1) {
              depList.push(depId);
              chip.classList.add('selected');
              chip.setAttribute('aria-pressed', 'true');
            } else {
              depList.splice(depIndex, 1);
              chip.classList.remove('selected');
              chip.setAttribute('aria-pressed', 'false');
            }
          });
          depsRow.appendChild(chip);
        }

        row.appendChild(depsRow);
      }

      taskListEl.appendChild(row);
    });
  }

  function setKind(newKind) {
    kind = newKind;
    kindSingle.classList.toggle('active', kind === 'single-task');
    kindMulti.classList.toggle('active', kind === 'multi-task');
    multiTaskSection.style.display = kind === 'multi-task' ? '' : 'none';
    if (kind === 'multi-task') {
      if (tasks.length === 0) {
        tasks = [{ title: '', prompt: '', dependsOn: [] }];
      }
      renderTaskList();
    }
  }

  kindSingle.addEventListener('click', () => setKind('single-task'));
  kindMulti.addEventListener('click', () => {
    setKind('multi-task');
    renderTaskList();
  });

  autoLandCheck.addEventListener('change', () => {
    policy.autoLand = autoLandCheck.checked;
  });

  autoMergeCheck.addEventListener('change', () => {
    policy.autoMergeOnGreen = autoMergeCheck.checked;
  });

  maxConcInput.addEventListener('input', () => {
    const v = parseInt(maxConcInput.value, 10);
    if (!isNaN(v) && v >= 1) {
      policy.maxConcurrent = v;
    }
  });

  addTaskBtn.addEventListener('click', () => {
    tasks.push({ title: '', prompt: '', dependsOn: [] });
    renderTaskList();
  });

  submitBtn.addEventListener('click', async () => {
    hideError();

    const prompt = promptTextarea.value.trim();
    if (kind === 'single-task' && !prompt) {
      showError('Prompt is required.');
      return;
    }

    if (kind === 'multi-task') {
      if (tasks.length === 0) {
        showError('Add at least one task.');
        return;
      }
      const emptyTask = tasks.find((t) => !t.prompt.trim());
      if (emptyTask) {
        showError('Each task must have a non-empty prompt.');
        return;
      }
    }

    const policyValue = {
      autoLand: autoLandCheck.checked,
      autoMergeOnGreen: autoMergeCheck.checked,
      maxConcurrent: parseInt(maxConcInput.value, 10) || 1,
    };

    const body = buildPostBody({
      title: titleInput.value,
      prompt,
      kind,
      policy: policyValue,
      tasks,
    });

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating…';

    try {
      const res = await fetch('/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showError(data.message || `Server error: ${res.status}`);
        return;
      }

      const workflow = await res.json();
      const workflowId = workflow.id;

      sheet.close();
      onSubmit?.(workflowId);
      window.location.hash = `#/workflow/${workflowId}`;
    } catch (err) {
      showError(err.message || 'Network error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create workflow';
    }
  });

  const sheet = createSheet({ title: 'New workflow', body: formEl, side: 'right' });
  sheet.panel.classList.add('new-workflow-sheet-panel');
  sheet.close();

  function open() {
    promptTextarea.value = '';
    titleInput.value = '';
    setKind('single-task');
    tasks = [{ title: '', prompt: '', dependsOn: [] }];
    autoLandCheck.checked = false;
    autoMergeCheck.checked = false;
    maxConcInput.value = '1';
    policy = { autoLand: false, autoMergeOnGreen: false, maxConcurrent: 1 };
    hideError();
    sheet.open();
  }

  function close() {
    sheet.close();
    onClose?.();
  }

  sheet.panel.querySelector('.sheet-close').addEventListener('click', () => {
    onClose?.();
  });

  const element = sheet.panel;

  return { element, open, close };
}

export { buildPostBody };
