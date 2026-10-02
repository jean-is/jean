// Mail's list (D111): the drawer's conversations, kept in view beside the one open, with the
// header's name above it and Settings at its foot, like the Claude apps' sidebar (D115).
import { html } from 'lit-html'
import { repeat } from 'lit-html/directives/repeat.js'
import { Element, define } from './base.js'
import { app, newConversation, openConversation, removeConversation } from './state.js'
import { t, relativeTime } from '../core/i18n.js'
import { icons } from './icons.js'
import { SHORTCUTS } from './shell.js'

/** The conversations, newest first, the open one marked: in the drawer, or in Mail's list. */
export function conversationList() {
  const list = app.conversations.value
  const currentId = app.current.value?.id
  return list.length ? html`<ol class="history-list">${repeat(list, (item) => item.id, (item) => html`
    <li class=${item.id === currentId ? 'is-current' : ''}>
      <button class="history-item" aria-current=${item.id === currentId ? 'true' : 'false'} @click=${() => openConversation(item.path)}>
        <span class="history-title" dir="auto">${item.title || t('conversation.untitled')}</span>
        <time datetime=${item.updatedAt}>${relativeTime(item.updatedAt)}</time>
      </button>
      <button class="icon-button subtle" aria-label=${t('action.delete')} title=${t('action.delete')}
        @click=${() => confirm(t('history.confirmDelete')) && removeConversation(item.path)}>${icons.trash}</button>
    </li>`)}</ol>` : html`<p class="muted">${t('history.empty')}</p>`
}

/** Settings, at the foot of the conversations: in the drawer, or in Mail's list (D115). */
export const settingsEntry = () => html`<button class="sidebar-settings" aria-keyshortcuts=${SHORTCUTS.settings}
  @click=${() => import('./dialogs.js').then((module) => module.openSettings())}>
  ${icons.gear}${t('settings.title')}</button>`

class Inbox extends Element {
  render() {
    return html`<button class="button wide" aria-keyshortcuts=${SHORTCUTS.new} @click=${newConversation}>${icons.plus} ${t('action.new')}</button>
      <app-projects></app-projects>
      ${conversationList()}
      ${settingsEntry()}`
  }
}

define('app-inbox', Inbox)
