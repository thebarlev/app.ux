interface RegistrationLogoProps {
  titleSize?: "default" | "small"
}

export function RegistrationLogo({ titleSize = "default" }: RegistrationLogoProps = {}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-primary/10">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-primary"
        >
          <path
            d="M3 21V7C3 5.89543 3.89543 5 5 5H19C20.1046 5 21 5.89543 21 7V21"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path d="M3 21H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M9 5V3C9 2.44772 9.44772 2 10 2H14C14.5523 2 15 2.44772 15 3V5"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M12 10V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M8 14H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <div className="text-center">
        <h1 className={titleSize === "small" ? "text-[44px]" : ""}>ברלב הנהלת חשבונות</h1>
        <p>הצטרפות למערכת</p>
      </div>
    </div>
  )
}
