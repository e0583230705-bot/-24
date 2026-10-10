import { getContext } from "@/lib/auth/dal";
import { listMembers } from "@/lib/services/members";
import { isRole, ROLES } from "@/lib/domain/permissions";
import { AddMemberForm } from "@/components/add-member-form";
import { removeMemberAction } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { TwoFactorSettings } from "@/components/two-factor-settings";
import { twoFactorStatus } from "@/lib/services/two-factor";

export default async function SettingsPage() {
  const { org, user, can } = await getContext();
  const [members, tf] = await Promise.all([listMembers(org.id), twoFactorStatus(user.id)]);
  const manage = can("manage_members");

  return (
    <div className="space-y-5">
      <PageHeader
        title="המשרד והצוות"
      />

      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="card-title">אימות דו־שלבי</h2>
          <span className={`badge ${tf.enabled ? "badge-good" : "badge-warn"}`}>{tf.enabled ? "פעיל" : "כבוי"}</span>
        </div>
        <TwoFactorSettings enabled={tf.enabled} enabledAt={tf.enabledAt?.toISOString() ?? null} backupCodesLeft={tf.backupCodesLeft} />
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>שם</th>
              <th>אימייל</th>
              <th>תפקיד</th>
              {manage && <th />}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId}>
                <td>
                  {m.name}
                  {m.userId === user.id && <span className="text-xs text-muted"> (את/ה)</span>}
                </td>
                <td className="num">{m.email}</td>
                <td>{isRole(m.role) ? ROLES[m.role].label : m.role}</td>
                {manage && (
                  <td className="text-end">
                    {m.userId !== user.id && (
                      <form action={removeMemberAction}>
                        <input type="hidden" name="userId" value={m.userId} />
                        <button className="btn-ghost btn-sm text-danger">הסרה</button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {manage && (
        <div className="card space-y-3">
          <h2 className="card-title">הוספת משתמש</h2>
          <AddMemberForm />
          <ul className="space-y-1 text-xs text-muted">
            {Object.values(ROLES).map((r) => (
              <li key={r.label}>
                <span className="font-medium">{r.label}:</span> {r.description}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
