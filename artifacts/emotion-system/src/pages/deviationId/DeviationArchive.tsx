import { Archive, Clock3, Download, Trash2 } from 'lucide-react';
import type { AppLanguage } from '../../i18n';
import { deviationText as tx } from './copy';
import type { StoredProjectSummary } from './projectStore';

interface DeviationArchiveProps {
  projects: StoredProjectSummary[];
  thumbnailUrls: Record<string, string>;
  language: AppLanguage;
  busy: boolean;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
}

function formatDate(value: number, language: AppLanguage) {
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-TW' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function DeviationArchive({
  projects,
  thumbnailUrls,
  language,
  busy,
  onLoad,
  onDelete,
  onDeleteAll,
}: DeviationArchiveProps) {
  const t = (value: string) => tx(language, value);

  return (
    <section className="deviation-panel deviation-archive" aria-label={t('MY ARCHIVES')}>
      <div className="deviation-panel-heading">
        <div><span className="deviation-kicker">04 / {t('Local archive · this device only')}</span><h2>{t('MY ARCHIVES')}</h2></div>
        {projects.length > 0 && (
          <button type="button" className="deviation-button deviation-button--danger" onClick={onDeleteAll} disabled={busy}>
            <Trash2 size={13} />{t('DELETE ALL')}
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="deviation-archive-empty">
          <Archive size={22} />
          <p>{t('No saved projects yet. Save a card project to start your archive.')}</p>
        </div>
      ) : (
        <div className="deviation-archive-grid">
          {projects.map((project, index) => (
            <article className="deviation-archive-card" key={project.id}>
              <div className="deviation-archive-preview">
                {thumbnailUrls[project.id]
                  ? <img src={thumbnailUrls[project.id]} alt={`${project.draft.cardName} ${t('No preview image')}`} />
                  : <div className="deviation-archive-no-image"><Archive size={20} /><span>{t('No preview image')}</span></div>}
                <span className="deviation-archive-index">ARCHIVE / {String(index + 1).padStart(3, '0')}</span>
                <span className="deviation-archive-level">LV.{String(project.draft.deviationLevel).padStart(2, '0')}</span>
              </div>
              <div className="deviation-archive-info">
                <h3>{project.draft.cardName || 'UNNAMED SUBJECT'}</h3>
                <p className="deviation-archive-project-name">{project.draft.selfDefinition || project.draft.bio}</p>
                <dl>
                  <div><dt>{t('SUBJECT ID')}</dt><dd>{project.draft.subjectId || '—'}</dd></div>
                  <div><dt>{t('CREATED DATE')}</dt><dd>{formatDate(project.createdAt, language)}</dd></div>
                  <div><dt>{t('SAVED AT')}</dt><dd><Clock3 size={10} />{formatDate(project.updatedAt, language)}</dd></div>
                  <div><dt>{t('DEVIATION LEVEL')}</dt><dd>{project.draft.deviationLevel.toString().padStart(2, '0')} / 100</dd></div>
                </dl>
              </div>
              <div className="deviation-archive-actions">
                <button type="button" className="deviation-button deviation-button--primary" onClick={() => onLoad(project.id)} disabled={busy}><Download size={12} />{t('LOAD PROJECT')}</button>
                <button type="button" className="deviation-button deviation-button--danger" onClick={() => onDelete(project.id)} disabled={busy}><Trash2 size={12} />{t('DELETE PROJECT')}</button>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="deviation-archive-note">{t('Projects are stored in this browser, not uploaded. Browser data can be cleared; export a project backup to move it or keep it long term.')}</p>
    </section>
  );
}
