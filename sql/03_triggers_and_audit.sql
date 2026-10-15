CREATE OR REPLACE FUNCTION fn_log_wallet_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    audit_id UUID;
BEGIN
    INSERT INTO wallet_audit_logs (guest_id, amount_changed, action_type, balance_after)
    VALUES (
        NEW.id,
        ABS(NEW.wallet_balance - OLD.wallet_balance),
        CASE
            WHEN NEW.wallet_balance < OLD.wallet_balance THEN 'DEBIT'
            ELSE 'CREDIT'
        END,
        NEW.wallet_balance
    ) RETURNING id INTO audit_id;
    -- Let the booking API retrieve the exact trigger-created entry within its transaction.
    PERFORM set_config('stayspot.last_audit_id', audit_id::text, true);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_balance_audit ON guests;

CREATE TRIGGER trg_wallet_balance_audit
AFTER UPDATE OF wallet_balance ON guests
FOR EACH ROW
WHEN (OLD.wallet_balance IS DISTINCT FROM NEW.wallet_balance)
EXECUTE PROCEDURE fn_log_wallet_audit();
