function clone(value) {
  return value == null ? value : structuredClone(value);
}

function pendingTask(tasks) {
  return tasks.find(task => task.status === 'pending' || task.pendingAction)
    || tasks.find(task => !['cancelled', 'rejected', 'completed'].includes(task.status));
}

function resolveTask(state, taskRef) {
  if (taskRef.kind === 'current') return pendingTask(state.tasks);
  if (taskRef.kind === 'stable_id') {
    return state.tasks.find(task => task.id === taskRef.value);
  }
  if (taskRef.kind === 'ordinal') return state.tasks[Number(taskRef.value) - 1];
  return null;
}

function nextTaskId(tasks) {
  let suffix = tasks.length + 1;
  while (tasks.some(task => task.id === `task_${suffix}`)) suffix += 1;
  return `task_${suffix}`;
}

export function workflowReducer(priorState, semanticDelta) {
  const state = clone(priorState) || {};
  state.tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const errors = [];

  if (!semanticDelta || semanticDelta.intent === 'rejection') {
    return { state, errors };
  }
  if (semanticDelta.intent === 'cancel_workflow') {
    state.workflowStatus = 'cancelled';
    return { state, errors };
  }
  if (semanticDelta.intent === 'start_new_request') {
    state.workflowStatus = 'active';
    state.tasks = [];
    state.selectedColors = [];
    state.allColors = false;
    return { state, errors };
  }

  for (const update of semanticDelta.taskUpdates || []) {
    if (update.action === 'set_scope') {
      if (Object.hasOwn(update.fields, 'allColors')) state.allColors = update.fields.allColors;
      if (Object.hasOwn(update.fields, 'productColors')) {
        state.selectedColors = [...new Set(update.fields.productColors)];
      }
      if (Object.hasOwn(update.fields, 'preserveMaterialCodes')) {
        state.preserveMaterialCodes = update.fields.preserveMaterialCodes;
      }
      if (Object.hasOwn(update.fields, 'withdrawReleasedRevision')) {
        state.withdrawReleasedRevision = update.fields.withdrawReleasedRevision;
      }
      continue;
    }

    let task;
    if (update.taskRef.kind === 'new') {
      task = {
        id: nextTaskId(state.tasks),
        type: update.taskRef.value,
        status: 'pending',
        pendingAction: null,
        fields: {},
        missingFields: [],
      };
      state.tasks.push(task);
    } else {
      task = resolveTask(state, update.taskRef);
    }
    if (!task) {
      errors.push({ code: 'TASK_NOT_FOUND', taskRef: clone(update.taskRef) });
      continue;
    }

    if (['create_task', 'provide_fields', 'correct_fields'].includes(update.action)) {
      task.fields = { ...(task.fields || {}), ...clone(update.fields) };
      task.missingFields = (task.missingFields || [])
        .filter(field => !Object.hasOwn(update.fields, field));
      task.status = task.missingFields.length === 0 ? 'completed' : 'pending';
      task.pendingAction = task.missingFields.length === 0 ? null : 'details_clarification';
    } else if (update.action === 'confirm_task') {
      task.status = 'confirmed';
      task.pendingAction = null;
    } else if (update.action === 'reject_task') {
      task.status = 'rejected';
      task.pendingAction = null;
    } else if (update.action === 'cancel_task') {
      task.status = 'cancelled';
      task.pendingAction = null;
    }
  }

  const statusByAction = {
    ask_clarification: 'awaiting_clarification',
    build_proposal: 'proposal_ready',
    cancel: 'cancelled',
    continue: 'active',
    reject: 'rejected',
    restart: 'active',
  };
  state.workflowStatus = statusByAction[semanticDelta.workflowAction] || state.workflowStatus;
  state.responseLanguage = semanticDelta.responseLanguage || state.responseLanguage;
  return { state, errors };
}
