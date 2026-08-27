export function PrivacyNoticePage() {
  return (
    <div className="page page--narrow">
      <header className="page__head">
        <p className="eyebrow">Privacy</p>
        <h1>How we use your information</h1>
        <p className="lead">
          This is a plain-language summary for the appointment booking service, in line with the Protection of
          Personal Information Act (POPIA).
        </p>
      </header>

      <section className="card" style={{ display: 'grid', gap: '18px' }}>
        <div>
          <h2>What we collect</h2>
          <p>
            Your name, email address, mobile number, and (optionally) your South African ID number and any notes you
            add when booking. We collect these to hold your appointment, confirm it with you, and have your details
            ready at the branch.
          </p>
        </div>
        <div>
          <h2>What we send</h2>
          <p>
            A confirmation, a reminder the day before, and a notice if your appointment is changed or cancelled, by
            email and SMS.
          </p>
        </div>
        <div>
          <h2>How long we keep it</h2>
          <p>
            Once an appointment is old enough that we no longer need your personal details for the purpose they were
            collected for, we remove your name, email, phone number, ID number, and notes from the record. The booking
            itself (its date, branch, and service) is kept in an anonymised form so we can still report on branch
            activity accurately.
          </p>
        </div>
        <div>
          <h2>Who can see it</h2>
          <p>
            Branch staff can look up a booking to help you by phone or in person. Every staff lookup, and anything a
            staff member changes on your behalf, is recorded in an internal audit log. Staff sign-in is separate from
            and cannot see your ID number.
          </p>
        </div>
        <div>
          <h2>Your rights</h2>
          <p>
            You can ask us to correct or delete your information, or ask what we hold about you, at any time by
            emailing <strong>privacy@capitec.example</strong>. Cancelling an appointment yourself also works from the{' '}
            <em>Find a booking</em> page using your reference.
          </p>
        </div>
      </section>
    </div>
  );
}
