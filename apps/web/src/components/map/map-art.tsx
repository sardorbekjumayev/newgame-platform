import { cx } from "@/components/ui";

/** Xarita yuklanmasa (kalit yo'q, tarmoq) — dizayndagi shartli xarita: ko'chalar va lime pinlar. */
export function MapArt({ single }: { single?: boolean }) {
  const pin = "absolute h-7 w-7 -rotate-45 rounded-[50%_50%_50%_0] border-[3px] border-fg bg-accent";
  const big = "sm:h-12 sm:w-12 sm:border-[5px]";
  return (
    <div className="absolute inset-0 bg-surface">
      <div className={cx("absolute -inset-x-10 top-[33%] h-2.5 -rotate-[8deg] bg-surface-3", !single && "sm:h-5")} />
      <div className={cx("absolute -inset-x-10 top-[66%] h-2.5 rotate-[6deg] bg-surface-3", !single && "sm:h-5")} />
      <div className={cx("absolute inset-y-0 left-[45%] w-2.5 bg-surface-3", !single && "sm:w-5")} />
      {single ? (
        <span className={cx(pin, "top-[38%] left-[52%]")} />
      ) : (
        <>
          <span className={cx(pin, big, "top-[24%] left-[25%]")} />
          <span className={cx(pin, big, "top-[47%] left-[64%]")} />
          <span className={cx(pin, big, "top-[62%] left-[38%] hidden sm:block")} />
        </>
      )}
    </div>
  );
}
